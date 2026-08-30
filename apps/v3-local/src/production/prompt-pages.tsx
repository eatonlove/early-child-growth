import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CircleAlert,
  Cpu,
  History,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, LoadingState, PageHeader, Panel } from "../components/ui";
import { RemoteApiError, remoteApi } from "./api";
import type { RemoteAIModelConfig, RemoteAIPrompt, RemoteAIPromptKey } from "./types";

const errorMessage = (reason: unknown) =>
  reason instanceof RemoteApiError ? reason.message : "操作失败，请稍后重试";

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "尚未自定义";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export function RemoteAIPromptPage() {
  const [items, setItems] = useState<RemoteAIPrompt[]>([]);
  const [modelConfig, setModelConfig] = useState<RemoteAIModelConfig | null>(null);
  const [modelDraft, setModelDraft] = useState("");
  const [selectedKey, setSelectedKey] = useState<RemoteAIPromptKey | null>(null);
  const [immutableSafetyPrompt, setImmutableSafetyPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = items.find((item) => item.key === selectedKey) ?? null;
  const dirty = Boolean(selected && draft !== selected.effectivePrompt);
  const modelDirty = Boolean(modelConfig && modelDraft !== modelConfig.model);
  const promptValid = draft.trim().length >= 100 && draft.trim().length <= 30000;
  const groups = useMemo(() => {
    const result = new Map<string, RemoteAIPrompt[]>();
    items.forEach((item) => result.set(item.category, [...(result.get(item.category) ?? []), item]));
    return [...result.entries()];
  }, [items]);

  const load = async (preferredKey?: RemoteAIPromptKey) => {
    setLoading(true);
    setError("");
    try {
      const [result, modelResult] = await Promise.all([remoteApi.aiPrompts(), remoteApi.aiModelConfig()]);
      setItems(result.items);
      setImmutableSafetyPrompt(result.immutableSafetyPrompt);
      setModelConfig(modelResult.item);
      setModelDraft(modelResult.item.model);
      const next = result.items.find((item) => item.key === preferredKey) ?? result.items[0] ?? null;
      setSelectedKey(next?.key ?? null);
      setDraft(next?.effectivePrompt ?? "");
      setChangeNote("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const choose = (item: RemoteAIPrompt) => {
    if (dirty && !window.confirm("当前提示词尚未保存，确定切换到其他场景吗？")) return;
    setSelectedKey(item.key);
    setDraft(item.effectivePrompt);
    setChangeNote("");
    setError("");
    setSuccess("");
  };

  const replaceItem = (item: RemoteAIPrompt) => {
    setItems((current) => current.map((entry) => entry.key === item.key ? item : entry));
    setSelectedKey(item.key);
    setDraft(item.effectivePrompt);
    setChangeNote("");
  };

  const save = async () => {
    if (!selected || !dirty || !promptValid) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await remoteApi.updateAIPrompt(selected.key, {
        systemPrompt: draft.trim(),
        expectedRevision: selected.revision,
        changeNote: changeNote.trim(),
      });
      replaceItem(result.item);
      setSuccess("提示词已保存，下一次该场景调用 AI 时立即采用新版本。已有分析结果不会被改写。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const saveModel = async () => {
    if (!modelConfig || !modelDirty) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await remoteApi.updateAIModelConfig({ model: modelDraft, expectedRevision: modelConfig.revision });
      setModelConfig(result.item);
      setModelDraft(result.item.model);
      setSuccess("统一模型已保存，下一次所有 AI 场景调用都会使用该模型；已有分析结果不会重跑。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!selected || selected.source !== "custom") return;
    if (!window.confirm(`确定将“${selected.name}”恢复为系统默认提示词吗？`)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await remoteApi.resetAIPrompt(selected.key, selected.revision);
      replaceItem(result.item);
      setSuccess("已恢复系统默认提示词，下一次调用生效。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="正在读取全部 AI 场景提示词…" />;

  return (
    <div className="remote-page prompt-page">
      <PageHeader
        eyebrow="AI PROFESSIONAL CONFIGURATION"
        title="提示词配置"
        description="集中维护观察、分析、报告与课程生成的园所提示词。仅教研员可修改，保存后从下一次 AI 调用开始生效。"
        actions={<Badge tone="purple"><Bot size={13} /> {items.length} 个 AI 场景</Badge>}
      />

      {error && <div className="prompt-alert prompt-alert-error" role="alert"><CircleAlert />{error}</div>}
      {success && <div className="prompt-alert prompt-alert-success" role="status"><Sparkles />{success}</div>}

      {modelConfig && <Panel
        className="prompt-model-panel"
        title="统一模型配置"
        subtitle="观察分析、文档解析、报告、课程与提示词修订共用这一项配置。额度不足时切换，保存后从下一次调用生效。"
        action={<Badge tone={modelConfig.source === "tenant" ? "orange" : "gray"}>{modelConfig.source === "tenant" ? "园所配置" : "系统默认"}</Badge>}
      >
        <div className="prompt-model-grid">
          <Cpu />
          <label>
            <span>千问模型</span>
            <select aria-label="千问模型" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} disabled={busy}>
              {modelConfig.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="prompt-model-description">
            <strong>{modelConfig.options.find((item) => item.value === modelDraft)?.description}</strong>
            <small>当前默认：{modelConfig.defaultModel} · 最近修改：{modelConfig.updatedByName ?? "系统维护"} · {formatUpdatedAt(modelConfig.updatedAt)}</small>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => void saveModel()} disabled={busy || !modelDirty}>
            <Save />{busy ? "正在保存…" : "保存统一模型"}
          </button>
        </div>
      </Panel>}

      <div className="prompt-safety-banner">
        <ShieldCheck />
        <div>
          <strong>安全与循证底线不可修改</strong>
          <p>园所提示词会与系统固定约束共同发送给 AI。隐私保护、证据可追溯、禁止诊断与标签化、禁止编造事实等规则始终有效。</p>
        </div>
        <details>
          <summary>查看固定约束</summary>
          <pre>{immutableSafetyPrompt}</pre>
        </details>
      </div>

      <div className="prompt-workspace">
        <Panel className="prompt-scene-list" title="全部场景" subtitle="按业务阶段选择需要调整的提示词">
          {groups.map(([category, prompts]) => (
            <section key={category} className="prompt-category">
              <h3>{category}</h3>
              {prompts.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={item.key === selectedKey ? "selected" : ""}
                  onClick={() => choose(item)}
                  disabled={busy}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <Badge tone={item.source === "custom" ? "orange" : "gray"}>
                    {item.source === "custom" ? "园所自定义" : "系统默认"}
                  </Badge>
                </button>
              ))}
            </section>
          ))}
        </Panel>

        {selected && (
          <Panel
            className="prompt-editor-panel"
            title={selected.name}
            subtitle={selected.description}
            action={
              <div className="prompt-status-badges">
                <Badge tone={selected.source === "custom" ? "orange" : "green"}>
                  {selected.source === "custom" ? "园所自定义生效中" : "系统默认生效中"}
                </Badge>
                {dirty && <Badge tone="blue">未保存</Badge>}
              </div>
            }
          >
            {selected.baseVersionOutdated && (
              <div className="prompt-alert prompt-alert-warning">
                <History />系统默认提示词已升级。当前园所自定义版本仍然有效，建议对照新版默认内容后重新保存。
              </div>
            )}

            <div className="prompt-version-grid">
              <span><small>场景编码</small><code>{selected.key}</code></span>
              <span><small>当前生效版本</small><code>{selected.effectiveVersion}</code></span>
              <span><small>系统默认版本</small><code>{selected.defaultVersion}</code></span>
              <span><small>最近修改</small><strong>{selected.updatedByName ?? "系统维护"} · {formatUpdatedAt(selected.updatedAt)}</strong></span>
            </div>

            <label className="prompt-editor-label">
              <span>园所场景提示词</span>
              <small>描述角色、分析步骤、专业标准与输出要求。不要写入密钥、幼儿姓名或其他真实敏感数据。</small>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={24}
                spellCheck={false}
                aria-describedby="prompt-character-count"
                disabled={busy}
              />
            </label>
            <div id="prompt-character-count" className={promptValid ? "prompt-character-count" : "prompt-character-count invalid"}>
              {draft.trim().length.toLocaleString()} / 30,000 字符，至少 100 字符
            </div>

            <label className="prompt-note-label">
              <span>修改说明</span>
              <input
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                maxLength={500}
                placeholder="例如：加强多人游戏中的同伴协商证据要求"
                disabled={busy}
              />
            </label>

            <div className="prompt-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDraft(selected.defaultPrompt)} disabled={busy}>
                <History />载入新版默认内容
              </button>
              {selected.source === "custom" && (
                <button className="btn btn-secondary prompt-reset" type="button" onClick={() => void reset()} disabled={busy}>
                  <RotateCcw />恢复系统默认
                </button>
              )}
              <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={busy || !dirty || !promptValid}>
                <Save />{busy ? "正在保存…" : "保存并用于后续 AI"}
              </button>
            </div>

            <details className="prompt-default-reference">
              <summary>对照系统默认提示词</summary>
              <pre>{selected.defaultPrompt}</pre>
            </details>
          </Panel>
        )}
      </div>
    </div>
  );
}
