import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2, CircleAlert, Download,
  FileInput, FileText, FileVideo, Plus, RefreshCcw, Save, Sparkles, Upload, Users,
} from "lucide-react";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, Panel } from "../components/ui";
import { remoteApi, RemoteApiError } from "./api";
import type {
  AnalysisClaimDecision, RemoteAnalysis, RemoteAnalysisFramework, RemoteChild, RemoteClassroom, RemoteCurriculumClue,
  RemoteCurriculumPlan, RemoteCurriculumTemplate, RemoteCurriculumWorkspace, RemoteEvidence,
  RemoteObservation, RemoteObservationImport, RemoteObservationSubject, RemoteObservationTemplate,
  RemoteObserver, RemoteProfessionalMemory, RemoteResponsePlan, RemoteUser,
} from "./types";

const showError = (reason: unknown) => reason instanceof RemoteApiError ? reason.message : "操作失败，请稍后重试";
const gradeLabel = { small: "小班 3-4岁", middle: "中班 4-5岁", large: "大班 5-6岁" } as const;
const stageLabel: Record<string, string> = { plan: "游戏计划", introduction: "游戏导入", process: "游戏过程", sharing: "游戏分享", evaluation: "游戏评价" };
const statusLabel: Record<string, string> = {
  submitted: "教师已提交", ai_ready: "待教师确认", adopted: "教师已采用", abandoned: "已放弃",
  pending: "待确认", suggested: "AI候选", planned: "待实施", implemented: "已实施", follow_up: "待复察",
  verified: "已验证", rejected: "未选择", clue: "课程线索", draft: "草案", reviewed: "已完善", active: "实施中", reflected: "已复盘",
};
const tone = (status: string): "green" | "orange" | "blue" | "gray" | "red" | "purple" =>
  /adopted|verified|reviewed|active|ready/.test(status) ? "green" : /abandoned|rejected|failed/.test(status) ? "red" : /pending|submitted|suggested|ai_ready/.test(status) ? "orange" : "gray";
const lines = (value: string) => value.split(/[\n，,]/).map((item) => item.trim()).filter(Boolean);

type SubjectDraft = { childId: string; role: "primary" | "participant" | "incidental"; contextualFeature: string };
const emptyObservation = () => ({
  classroomId: "", templateId: "", sourceImportId: "", observerIds: [] as string[], occurredAt: new Date().toISOString().slice(0, 16), durationMinutes: 20,
  scene: "建构区", theme: "", organizationStage: "process", observationFocus: "材料选择与使用",
  groupContext: "", unlistedParticipantCount: 0, teacherObservation: "", teacherIdentification: "",
  responseCategory: "experience", responseStrategy: "", nextObservationFocus: "", subjects: [] as SubjectDraft[],
});

type ObservationDetail = {
  item: RemoteObservation;
  evidence: RemoteEvidence[];
  analyses: RemoteAnalysis[];
  subjects: RemoteObservationSubject[];
  responsePlans: RemoteResponsePlan[];
  observers: RemoteObserver[];
};

const analysisSections = [
  { key: "objective", title: "客观事实", hint: "事实摘要与原始行为证据" },
  { key: "game_experience", title: "游戏经验", hint: "七个经验维度，不生成总分" },
  { key: "domains", title: "五大领域经验", hint: "无证据的领域明确不作判断" },
  { key: "dispositions", title: "学习品质", hint: "六类学习品质线索" },
  { key: "possibilities", title: "学习与游戏可能", hint: "作为待验证方向，不是确定性结论" },
  { key: "response", title: "应答方案", hint: "活动、材料、经验三类支持" },
  { key: "observation", title: "下次观察", hint: "观察切口和具体观察点" },
] as const;

export function normalizeAnalysisResultForView(rawResult: RemoteAnalysis["structured_result"]) {
  return {
    isLegacyAnalysis: !rawResult.gameExperience || !rawResult.domainExperiences || !rawResult.learningDispositions,
    result: {
      ...rawResult,
      objectiveSummary: rawResult.objectiveSummary || "历史分析未提供客观摘要",
      evidenceSufficiency: rawResult.evidenceSufficiency || "历史版本",
      warnings: rawResult.warnings ?? ["该分析由旧版结构生成，可重新运行AI以补充3.2专业板块。"],
      facts: rawResult.facts ?? [],
      gameExperience: rawResult.gameExperience ?? [],
      domainExperiences: rawResult.domainExperiences ?? [],
      learningDispositions: rawResult.learningDispositions ?? [],
      learningPossibilities: rawResult.learningPossibilities ?? [],
      gamePossibilities: rawResult.gamePossibilities ?? [],
      observationCut: rawResult.observationCut ?? [],
      observationFocus: rawResult.observationFocus ?? [],
    },
  };
}

function AnalysisBoard({
  analysis, childName, responsePlans, evidence, busy, onRefresh, onError,
}: {
  analysis: RemoteAnalysis;
  childName: string;
  responsePlans: RemoteResponsePlan[];
  evidence: RemoteEvidence[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [mixTitle, setMixTitle] = useState("教师组合应答方案");
  const [mix, setMix] = useState({ activityPlanId: "", materialPlanId: "", experiencePlanId: "" });
  const { result, isLegacyAnalysis } = normalizeAnalysisResultForView(analysis.structured_result);
  const claimReviews = analysis.claim_reviews ?? [];
  const sectionClaims = (section: string) => claimReviews.filter((claim) => ({
    objective: ["objective_summary", "fact"],
    game_experience: ["game_experience", "current_experience", "interpretation", "historical_change"],
    domains: ["domain_experience", "development_reference"],
    dispositions: ["learning_disposition", "interest_strength"],
    possibilities: ["learning_possibility", "game_possibility", "hypothesis", "evidence_gap"],
    response: ["response_plan", "response_suggestion"],
    observation: ["observation_cut", "observation_focus", "next_observation"],
  }[section] ?? []).includes(claim.claim_type));
  const sectionState = (section: string) => {
    const claims = sectionClaims(section);
    if (!claims.length || claims.some((claim) => claim.decision === "pending")) return "待审核";
    if (claims.some((claim) => claim.decision === "to_verify")) return "待验证";
    if (claims.every((claim) => claim.decision === "rejected")) return "已拒绝";
    return "已处理";
  };
  const run = async (operation: () => Promise<unknown>) => {
    try { await operation(); await onRefresh(); } catch (reason) { onError(showError(reason)); }
  };
  const reviewSection = (section: string, decision: Exclude<AnalysisClaimDecision, "pending" | "modified">) =>
    run(() => remoteApi.reviewAnalysisSection(analysis.id, section, { decision, note: note || "按专业板块快速审核", edits: {} }));
  const allHandled = claimReviews.length > 0 && claimReviews.every((claim) => claim.decision !== "pending");
  return (
    <div className="evo-analysis-board">
      <Panel className="evo-ai-summary">
        <div className="evo-section-head"><div><Badge tone="purple">AI建议稿 · {childName}</Badge><h2>{result.objectiveSummary}</h2></div><Badge tone={tone(analysis.decision)}>{statusLabel[analysis.decision] ?? analysis.decision}</Badge></div>
        <p>{result.evidenceSufficiency}证据。{result.warnings.join("；")}</p>
        {isLegacyAnalysis && <p className="warning-card">这是历史AI结构，已有事实继续保留；新增专业板块不作推测，可在下方重新生成新版本。</p>}
      </Panel>
      <div className="evo-analysis-sections">
        {analysisSections.map((section) => <Panel key={section.key} className="evo-analysis-section">
          <div className="evo-section-head"><div><h3>{section.title}</h3><small>{section.hint}</small></div><Badge tone={sectionState(section.key) === "待审核" ? "orange" : "green"}>{sectionState(section.key)}</Badge></div>
          {section.key === "objective" && <><p>{result.objectiveSummary}</p>{result.facts.map((item, index) => <p key={index}>• {item.content} <small>证据：{item.evidence}</small></p>)}</>}
          {section.key === "game_experience" && result.gameExperience.map((item) => <article key={item.dimension}><strong>{item.dimension}</strong><p>{item.possibleExperience}</p><small>{item.evidence}；边界：{item.limitation}</small></article>)}
          {section.key === "domains" && result.domainExperiences.map((item) => <article key={item.domain}><strong>{item.domain}</strong><p>{item.noJudgment ? "本次证据不足，不作判断" : item.possibleExperience}</p><small>{item.noJudgment ? item.missingEvidence : `${item.evidence} · ${(item.indicatorCodes ?? []).join("、") || "待补指标"}`}</small></article>)}
          {section.key === "dispositions" && result.learningDispositions.map((item) => <article key={item.dimension}><strong>{item.dimension}</strong><p>{item.possibleExperience}</p><small>{item.evidence} · 置信度{Math.round(item.confidence * 100)}%</small></article>)}
          {section.key === "possibilities" && <>{[...result.learningPossibilities, ...result.gamePossibilities].map((item) => <p key={item}>• {item}</p>)}</>}
          {section.key === "response" && <p>已生成3套完整候选方案，请在下方完成终审后选择其中一套。</p>}
          {section.key === "observation" && <><p><strong>观察切口：</strong>{result.observationCut.join("；")}</p>{result.observationFocus.map((item) => <p key={item}>• {item}</p>)}</>}
          {isLegacyAnalysis && section.key !== "objective" && sectionClaims(section.key).length === 0 && <p className="empty-inline">历史版本未生成此板块。</p>}
          {analysis.decision === "pending" && <div className="evo-review-actions">
            <button className="btn btn-secondary" disabled={busy} onClick={() => void reviewSection(section.key, "adopted")}><Check />整组采用</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => void reviewSection(section.key, "to_verify")}>标记待验证</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void reviewSection(section.key, "rejected")}>整组不采用</button>
          </div>}
          <details><summary>查看底层证据链与逐条状态（{sectionClaims(section.key).length}项）</summary>{sectionClaims(section.key).map((claim) => <p key={claim.claim_key}><Badge tone={claim.decision === "pending" ? "orange" : "gray"}>{claim.decision}</Badge> {String(claim.reviewed_content?.content ?? claim.original_content.content ?? claim.claim_key)}</p>)}</details>
        </Panel>)}
      </div>
      {analysis.decision === "pending" && <Panel title="教师反馈与AI修订" subtitle="修订会生成AI V2新版本，原始分析与教师反馈完整保留。">
        <textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="例如：科学领域证据不足，请删除推断；应答材料需要更具体。" />
        <div className="evo-review-actions"><button className="btn btn-secondary" disabled={busy || feedback.trim().length < 2} onClick={() => void run(() => remoteApi.reviseAnalysis(analysis.id, [{ section: "综合反馈", decision: "revise", note: feedback }] ))}><RefreshCcw />生成AI V2</button></div>
      </Panel>}
      {analysis.decision === "pending" && <Panel title="完成教师终审" subtitle="所有专业板块处理后，正式结论才会进入成长轨迹、报告和课程证据。">
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="终审说明（选填）" />
        <button className="btn btn-primary" disabled={busy || !allHandled} onClick={() => void run(() => remoteApi.finalizeAnalysis(analysis.id, note))}><CheckCircle2 />完成终审</button>
      </Panel>}
      <Panel title="候选应答方案" subtitle="每套方案同时包含活动、材料和经验支持；终审后选择1套进入实施与复察。">
        <div className="evo-response-grid">{responsePlans.map((plan) => <article key={plan.id} className="evo-response-card">
          <div className="evo-section-head"><h3>{plan.title}</h3><Badge tone={tone(plan.status)}>{statusLabel[plan.status] ?? plan.status}</Badge></div>
          <p>{plan.rationale}</p>
          <h4>活动支持</h4><p>{plan.activity_support.activityName} · {plan.activity_support.timing} · {plan.activity_support.suggestedDuration}</p>
          <h4>材料支持</h4><p>{plan.material_support.materials.map((item) => `${item.name}${item.quantity ? `（${item.quantity}）` : ""}`).join("、")}</p>
          <h4>经验支持</h4><p>{plan.experience_support.suggestedQuestions.join("；")}</p>
          <small>介入退出：{plan.experience_support.withdrawalCondition}<br />复察切口：{plan.observation_cut}</small>
          {plan.status === "suggested" && <button className="btn btn-primary" disabled={busy || analysis.decision !== "adopted"} onClick={() => void run(() => remoteApi.selectResponsePlan(plan.id))}>选择该方案</button>}
        </article>)}</div>
        {analysis.decision === "adopted" && responsePlans.filter((item) => item.status === "suggested").length > 1 && <div className="evo-response-mixer"><h3>组合一套正式方案</h3><p>可分别选择活动、材料和经验支持的来源，系统会保留来源方案并生成一套实施任务。</p><div className="remote-form-grid"><label><b>方案名称</b><input value={mixTitle} onChange={(event) => setMixTitle(event.target.value)} /></label>{(["activityPlanId", "materialPlanId", "experiencePlanId"] as const).map((key) => <label key={key}><b>{{ activityPlanId: "活动支持来源", materialPlanId: "材料支持来源", experiencePlanId: "经验支持来源" }[key]}</b><select value={mix[key] || responsePlans.find((item) => item.status === "suggested")?.id || ""} onChange={(event) => setMix({ ...mix, [key]: event.target.value })}>{responsePlans.filter((item) => item.status === "suggested").map((plan) => <option value={plan.id} key={plan.id}>{plan.title}</option>)}</select></label>)}</div><button className="btn btn-primary" disabled={busy || mixTitle.trim().length < 2} onClick={() => { const fallbackId = responsePlans.find((item) => item.status === "suggested")?.id || ""; void run(() => remoteApi.combineResponsePlans({ title: mixTitle, activityPlanId: mix.activityPlanId || fallbackId, materialPlanId: mix.materialPlanId || fallbackId, experiencePlanId: mix.experiencePlanId || fallbackId })); }}><CheckCircle2 />保存组合并进入实施</button></div>}
      </Panel>
      <Panel title="证据索引" subtitle="所有专业判断均需回到教师原稿或媒体证据。"><div className="remote-file-list">{evidence.map((item) => <span className="badge" key={item.id}><FileVideo />{item.file_name || item.id.slice(0, 8)}</span>)}</div></Panel>
    </div>
  );
}

function SimpleAnalysisBoard({
  analysis,
  observation,
  childName,
  responsePlans,
  evidence,
  busy,
  onRefresh,
  onError,
}: {
  analysis: RemoteAnalysis;
  observation: RemoteObservation;
  childName: string;
  responsePlans: RemoteResponsePlan[];
  evidence: RemoteEvidence[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const { result, isLegacyAnalysis } = normalizeAnalysisResultForView(analysis.structured_result);
  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      await onRefresh();
    } catch (reason) {
      onError(showError(reason));
    }
  };
  const responseSummary = [
    ...(result.responseSuggestions?.experience ?? []),
    ...(result.responseSuggestions?.material ?? []),
    ...(result.responseSuggestions?.activity ?? []),
  ];
  return (
    <div className="simple-analysis-board">
      <Panel className="simple-ai-heading">
        <div>
          <Badge tone="purple">AI分析 · {childName}</Badge>
          <h2>教师原稿与 AI 第二视角并列呈现</h2>
          <p>AI只依据本次文字、图片或视频证据和对应年龄段《指南》知识卡生成；最终是否采用由教师确认。</p>
        </div>
        <Badge tone={tone(analysis.decision)}>{analysis.decision === "pending" ? "待教师确认" : analysis.decision === "adopted" ? "教师已确认" : "本次未采用"}</Badge>
      </Panel>

      <div className="simple-analysis-core">
        <article className="analysis-core-card observation">
          <header><span>01</span><div><strong>观察</strong><small>客观白描</small></div></header>
          <div className="teacher-source"><b>教师记录</b><p>{observation.teacher_observation}</p></div>
          <div className="ai-result"><b>AI整理</b><p>{result.objectiveSummary}</p>{result.facts.slice(0, 4).map((item, index) => <small key={index}>• {item.content}</small>)}</div>
        </article>
        <article className="analysis-core-card identification">
          <header><span>02</span><div><strong>识别</strong><small>结合《指南》五大领域</small></div></header>
          <div className="teacher-source"><b>教师识别</b><p>{observation.teacher_identification}</p></div>
          <div className="ai-result"><b>AI识别</b><p>{result.currentExperience}</p>{result.developmentReferences.slice(0, 4).map((item) => <small key={item.indicatorCode}>• {item.domain}：{item.evidenceStatement || item.title}</small>)}</div>
        </article>
        <article className="analysis-core-card response">
          <header><span>03</span><div><strong>应答</strong><small>下一步支持与提升</small></div></header>
          <div className="teacher-source"><b>教师原始应答</b><p>{observation.teacher_response.strategy}</p></div>
          <div className="ai-result"><b>AI建议</b>{responseSummary.slice(0, 5).map((item) => <p key={item}>• {item}</p>)}<small>下一次观察：{result.nextObservation.join("；") || observation.teacher_response.nextObservationFocus}</small></div>
        </article>
      </div>

      <details className="analysis-expansion">
        <summary><span>拓展</span><strong>查看游戏经验、五大领域、学习品质与后续可能</strong><small>这些内容用于拓宽教师思考，不替代观察、识别、应答主结论。</small></summary>
        <div className="analysis-expansion-grid">
          <section><h3>游戏经验</h3>{result.gameExperience.map((item) => <p key={item.dimension}><b>{item.dimension}</b>{item.possibleExperience}</p>)}</section>
          <section><h3>五大领域</h3>{result.domainExperiences.map((item) => <p key={item.domain}><b>{item.domain}</b>{item.noJudgment ? "本次证据不足，不作判断" : item.possibleExperience}</p>)}</section>
          <section><h3>学习品质</h3>{result.learningDispositions.map((item) => <p key={item.dimension}><b>{item.dimension}</b>{item.possibleExperience}</p>)}</section>
          <section><h3>学习与游戏可能</h3>{[...result.learningPossibilities, ...result.gamePossibilities].map((item) => <p key={item}>• {item}</p>)}</section>
        </div>
        {isLegacyAnalysis && <p className="warning-card">这是历史分析结构，部分拓展维度尚未生成，可重新运行AI补充。</p>}
      </details>

      {analysis.decision === "pending" && <div className="analysis-confirm-grid">
        <Panel title="让AI按教师意见修订" subtitle="例如要求删除证据不足的推断，或将应答材料写得更具体。">
          <textarea rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="填写修改意见后生成新版本" />
          <button className="btn btn-secondary" disabled={busy || feedback.trim().length < 2} onClick={() => void run(() => remoteApi.reviseAnalysis(analysis.id, [{ section: "观察-识别-应答", decision: "revise", note: feedback }]))}><RefreshCcw />生成AI修订稿</button>
        </Panel>
        <Panel title="教师确认" subtitle="确认后，这份分析才会进入成长轨迹、周期报告和课程线索。">
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="确认说明（选填）" />
          <div className="evo-review-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void run(() => remoteApi.decideAnalysis(analysis.id, "adopted", note))}><CheckCircle2 />确认并采用</button><button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => remoteApi.decideAnalysis(analysis.id, "abandoned", note || "本次暂不采用"))}>本次不采用</button></div>
        </Panel>
      </div>}

      {analysis.decision === "adopted" && <Panel title="应答方案" subtitle="选择一套适合当前情境的方案进入实施与复察；教师仍可按现场情况调整。">
        <div className="simple-response-list">{responsePlans.map((plan) => <article key={plan.id}><div><Badge tone={tone(plan.status)}>{statusLabel[plan.status] ?? plan.status}</Badge><h3>{plan.title}</h3><p>{plan.rationale}</p><small>活动：{plan.activity_support.activityName} · 材料：{plan.material_support.materials.map((item) => item.name).join("、")} · 观察切口：{plan.observation_cut}</small></div>{plan.status === "suggested" && <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => remoteApi.selectResponsePlan(plan.id))}>采用该应答</button>}</article>)}</div>
      </Panel>}
      <Panel title="证据索引" subtitle="所有分析均可回到教师原稿和本次媒体证据。"><div className="remote-file-list">{evidence.map((item) => <span className="badge" key={item.id}><FileVideo />{item.file_name || item.id.slice(0, 8)}</span>)}</div></Panel>
    </div>
  );
}

export function RemoteObservationV32Page({ user }: { user: RemoteUser }) {
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [children, setChildren] = useState<RemoteChild[]>([]);
  const [observations, setObservations] = useState<RemoteObservation[]>([]);
  const [templates, setTemplates] = useState<RemoteObservationTemplate[]>([]);
  const [observers, setObservers] = useState<RemoteObserver[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ObservationDetail | null>(null);
  const [analysisChildId, setAnalysisChildId] = useState("");
  const [form, setForm] = useState(emptyObservation());
  const [files, setFiles] = useState<File[]>([]);
  const [entry, setEntry] = useState<"choice" | "web" | "import" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<RemoteObservationImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const classChildren = children.filter((child) => child.classroom_id === form.classroomId && child.status === "active");
  const childMap = useMemo(() => new Map(children.map((child) => [child.id, child])), [children]);
  const load = async () => {
    const [classes, childRows, rows] = await Promise.all([remoteApi.classrooms(), remoteApi.children(), remoteApi.observations()]);
    setClassrooms(classes.items.filter((item) => item.status === "active")); setChildren(childRows.items); setObservations(rows.items);
    setSelected((current) => current || rows.items[0]?.id || "");
    setForm((current) => ({ ...current, classroomId: current.classroomId || classes.items.find((item) => item.status === "active")?.id || "" }));
  };
  const refreshDetail = async () => { if (!selected) return; const result = await remoteApi.observation(selected); setDetail(result); setAnalysisChildId((current) => result.subjects.some((item) => item.child_id === current) ? current : result.subjects[0]?.child_id || ""); };
  useEffect(() => { load().catch((reason) => setError(showError(reason))).finally(() => setLoaded(true)); }, []);
  useEffect(() => { if (selected) refreshDetail().catch((reason) => setError(showError(reason))); else setDetail(null); }, [selected]);
  useEffect(() => {
    const grade = classrooms.find((item) => item.id === form.classroomId)?.grade;
    if (!form.classroomId) return;
    remoteApi.templates({ grade, scene: form.scene }).then((result) => setTemplates(result.items)).catch((reason) => setError(showError(reason)));
  }, [classrooms, form.classroomId, form.scene]);
  useEffect(() => {
    if (!form.classroomId) return setObservers([]);
    remoteApi.observers(form.classroomId).then((result) => setObservers(result.items)).catch((reason) => setError(showError(reason)));
  }, [form.classroomId]);
  useEffect(() => {
    if (!classChildren.length) return setForm((current) => ({ ...current, subjects: [] }));
    setForm((current) => current.subjects.some((subject) => classChildren.some((child) => child.id === subject.childId)) ? current : { ...current, subjects: [{ childId: classChildren[0].id, role: "primary", contextualFeature: "" }] });
  }, [form.classroomId, children]);
  const withBusy = async (operation: () => Promise<void>) => { setBusy(true); setError(""); try { await operation(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } };
  const toggleSubject = (childId: string) => setForm((current) => {
    const exists = current.subjects.some((item) => item.childId === childId);
    if (exists && current.subjects.length === 1) return current;
    if (exists) {
      const remaining = current.subjects.filter((item) => item.childId !== childId);
      if (!remaining.some((item) => item.role === "primary")) remaining[0] = { ...remaining[0], role: "primary" };
      return { ...current, subjects: remaining };
    }
    return { ...current, subjects: [...current.subjects, { childId, role: "participant", contextualFeature: "" }] };
  });
  const submit = (event: FormEvent) => { event.preventDefault(); void withBusy(async () => {
    const created = await remoteApi.createObservation({
      classroomId: form.classroomId, templateId: form.templateId || undefined, sourceImportId: form.sourceImportId || undefined,
      observerIds: form.observerIds, groupContext: form.groupContext, unlistedParticipantCount: Number(form.unlistedParticipantCount),
      subjects: form.subjects, occurredAt: new Date(form.occurredAt).toISOString(), durationMinutes: Number(form.durationMinutes),
      scene: form.scene, theme: form.theme, organizationStage: form.organizationStage, observationFocus: lines(form.observationFocus),
      teacherObservation: form.teacherObservation, teacherIdentification: form.teacherIdentification,
      teacherResponse: { category: form.responseCategory, strategy: form.responseStrategy, nextObservationFocus: form.nextObservationFocus },
    });
    for (const file of files) await remoteApi.uploadEvidence(created.item.id, file);
    setEntry(null); setFiles([]); setImportFile(null); setImportResult(null); setForm({ ...emptyObservation(), classroomId: form.classroomId });
    await load(); setSelected(created.item.id);
  }); };
  const importDocument = () => void withBusy(async () => {
    if (!importFile || !form.classroomId) return;
    const result = await remoteApi.importObservationDocument(form.classroomId, importFile); setImportResult(result.item);
    const fields = result.item.extracted_fields;
    const matched = (fields.subjects ?? []).map((subject, index) => {
      const child = classChildren.find((item) => item.display_name.trim() === subject.displayName.trim());
      return child ? { childId: child.id, role: index === 0 ? "primary" as const : subject.role === "primary" ? "participant" as const : subject.role, contextualFeature: subject.contextualFeature } : null;
    }).filter((item): item is SubjectDraft => Boolean(item));
    setForm((current) => ({ ...current, sourceImportId: result.item.id, occurredAt: current.occurredAt, scene: fields.scene || current.scene, theme: fields.theme || current.theme,
      organizationStage: fields.organizationStage || current.organizationStage, subjects: matched.length ? matched : current.subjects,
      unlistedParticipantCount: fields.unlistedParticipantCount ?? 0, groupContext: fields.groupContext || "", teacherObservation: fields.objectiveObservation || "",
      teacherIdentification: fields.teacherIdentification || "", responseStrategy: fields.teacherResponseDraft || "", nextObservationFocus: fields.nextObservationFocus || "" }));
    setEntry("web");
  });
  const latest = detail?.analyses.filter((item) => item.child_id === analysisChildId)[0];
  const responsePlans = detail?.responsePlans.filter((item) => item.child_id === analysisChildId && (!latest || item.analysis_run_id === latest.id)) ?? [];
  const exportObservation = (variant: "teacher" | "professional") => void withBusy(async () => {
    if (!detail) return;
    const result = await remoteApi.createObservationDocument(detail.item.id, variant);
    await remoteApi.documentExportDownload(result.documentExport.id);
  });
  return <div className="page remote-page evo-page">
    <PageHeader eyebrow="观察 · 识别 · 应答" title="标准游戏观察" description="网页填写和上传已有观察表最终形成同一种教师可校对记录；群体观察按幼儿分别分析。" actions={<div className="page-action-row"><button className="btn btn-secondary" onClick={() => void remoteApi.downloadObservationTemplate()}><Download />下载标准模板</button><button className="btn btn-primary" onClick={() => setEntry("choice")}><Plus />新建观察</button></div>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}
    <div className="evo-flow"><span>1 教师记录</span><span>2 AI生成观察、识别、应答</span><span>3 教师确认</span><span>4 实施与复察</span></div>
    <div className="remote-observation-layout">
      <Panel className="remote-observation-list"><div className="remote-list-head"><strong>观察记录</strong><span>{observations.length}条</span></div>{observations.map((item) => <button className={selected === item.id ? "selected" : ""} key={item.id} onClick={() => setSelected(item.id)}><span>{item.scene.slice(0, 1)}</span><div><strong>{item.title}</strong><small>{item.scene} · {new Date(item.occurred_at).toLocaleDateString("zh-CN")}</small><Badge tone={tone(item.status)}>{statusLabel[item.status] ?? item.status}</Badge></div></button>)}</Panel>
      {!loaded ? <LoadingState /> : detail ? <div className="detail-stack">
        <Panel><div className="remote-detail-head"><div><div className="knowledge-badges"><Badge tone="green">{detail.item.scene}</Badge><Badge tone="blue">{stageLabel[detail.item.organization_stage]}</Badge><Badge tone={tone(detail.item.status)}>{statusLabel[detail.item.status]}</Badge></div><h2>{detail.item.title}</h2><p>{detail.item.theme} · 观察教师：{detail.observers.map((item) => item.displayName).join("、") || user.displayName}</p></div><div className="page-action-row"><button className="btn btn-secondary" disabled={busy} onClick={() => exportObservation("teacher")}><Download />导出教师原稿</button><button className="btn btn-secondary" disabled={busy} onClick={() => exportObservation("professional")}><FileText />导出专业版</button></div></div><div className="evo-subject-chips">{detail.subjects.map((subject) => <button className={analysisChildId === subject.child_id ? "selected" : ""} key={subject.id} onClick={() => setAnalysisChildId(subject.child_id)}><strong>{subject.display_name}</strong><small>{subject.role === "primary" ? "主要观察" : subject.role === "incidental" ? "偶发参与" : "共同参与"} · {subject.contextual_feature || "未补充本次特征"}</small></button>)}{detail.item.unlisted_participant_count ? <span>另有{detail.item.unlisted_participant_count}名未列名参与者</span> : null}</div></Panel>
        <div className="remote-three-layers"><Panel><Badge tone="blue">观察</Badge><p>{detail.item.teacher_observation}</p></Panel><Panel><Badge tone="green">识别</Badge><p>{detail.item.teacher_identification}</p></Panel><Panel><Badge tone="orange">教师原始应答</Badge><p>{detail.item.teacher_response.strategy}</p><small>复察：{detail.item.teacher_response.nextObservationFocus}</small></Panel></div>
        {detail.evidence.length > 0 && <Panel title="照片、视频与作品证据"><div className="remote-file-list">{detail.evidence.map((item) => <button className="btn btn-secondary" key={item.id} disabled={item.upload_status !== "ready"} onClick={() => void withBusy(async () => { const result = await remoteApi.evidenceDownload(item.id); window.open(result.url, "_blank", "noopener,noreferrer"); })}><FileVideo />{item.file_name || "未命名证据"}</button>)}</div></Panel>}
        {(!latest || latest.decision !== "pending") && <Panel className="remote-ai-launch"><Sparkles /><div><Badge tone="purple">按幼儿独立分析</Badge><h2>为{detail.subjects.length}名幼儿分别生成专业第二视角</h2><p>只依据能够归属到该幼儿的文字和媒体证据；无法区分时明确提示证据不足。</p></div><button className="btn btn-primary" disabled={busy} onClick={() => void withBusy(async () => { await remoteApi.analyze(detail.item.id); await refreshDetail(); await load(); })}><BrainCircuit />{latest ? "生成新版本" : "运行AI分析"}</button></Panel>}
        {latest && <SimpleAnalysisBoard analysis={latest} observation={detail.item} childName={childMap.get(analysisChildId)?.display_name ?? "幼儿"} responsePlans={responsePlans} evidence={detail.evidence} busy={busy} onRefresh={async () => { await Promise.all([refreshDetail(), load()]); }} onError={setError} />}
      </div> : <EmptyState title="还没有观察记录" description="教师可网页填写，也可上传现有观察表由AI提取字段后校对。" />}
    </div>
    {entry === "choice" && <Modal title="选择观察记录方式" description="两种方式最终进入同一份标准观察草稿。" onClose={() => setEntry(null)}><div className="evo-entry-grid"><button onClick={() => setEntry("web")}><FileText /><strong>网页直接填写</strong><span>适合现场或观察后快速记录</span></button><button onClick={() => setEntry("import")}><FileInput /><strong>上传已有观察表</strong><span>DOCX、DOC、PDF、JPG或PNG，AI提取后必须校对</span></button></div></Modal>}
    {entry === "import" && <Modal title="导入已有观察表" description="AI只做字段提取，不直接形成发展结论。PDF和图片准确率可能较低。" onClose={() => setEntry(null)}><div className="remote-form"><label><span>班级</span><select value={form.classroomId} onChange={(event) => setForm({ ...form, classroomId: event.target.value })}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>观察表文件（最大10MB）</span><input type="file" accept=".docx,.doc,.pdf,.jpg,.jpeg,.png" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label>{importResult?.extracted_fields.warnings?.map((warning) => <p className="warning-card" key={warning}>{warning}</p>)}<button className="btn btn-primary" disabled={busy || !importFile} onClick={importDocument}><Upload />提取并进入教师校对</button></div></Modal>}
    {entry === "web" && <Modal wide title={form.sourceImportId ? "校对AI提取的观察草稿" : "新建标准观察"} description="不填写人工标题；系统按日期、主题和主要幼儿自动命名。幼儿原话写入客观白描。" onClose={() => setEntry(null)}><form className="remote-observation-form" onSubmit={submit}>
      <div className="remote-form-section"><span>01 情境与观察者</span><div className="remote-form-grid"><label><b>主观察教师</b><input value={user.displayName} disabled /></label><label><b>班级</b><select value={form.classroomId} onChange={(event) => setForm({ ...form, classroomId: event.target.value, observerIds: [] })}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name} · {gradeLabel[item.grade]}</option>)}</select></label><label className="full-field"><b>协同观察者（可选）</b><div className="evo-observer-picker">{observers.filter((item) => item.userId !== user.id).map((item) => <label key={item.userId}><input type="checkbox" checked={form.observerIds.includes(item.userId)} onChange={() => setForm((current) => ({ ...current, observerIds: current.observerIds.includes(item.userId) ? current.observerIds.filter((id) => id !== item.userId) : [...current.observerIds, item.userId] }))} />{item.displayName}<small>{item.role === "researcher" ? "教研员" : "教师"}</small></label>)}</div></label><label><b>发生时间</b><input required type="datetime-local" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} /></label><label><b>游戏场地</b><input required value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} /></label><label><b>游戏主题</b><input required value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value })} /></label><label><b>组织阶段</b><select value={form.organizationStage} onChange={(event) => setForm({ ...form, organizationStage: event.target.value })}>{Object.entries(stageLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><b>观察模板</b><select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}><option value="">通用观察结构</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><b>持续分钟</b><input type="number" min="1" max="240" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label></div></div>
      <div className="remote-form-section"><span>02 参与幼儿与本次特征</span><p>勾选本次可识别幼儿，指定1名主要观察对象；“本次特征”只描述当下情境，不写固定人格标签。</p><div className="evo-child-select">{classChildren.map((child) => { const subject = form.subjects.find((item) => item.childId === child.id); return <article className={subject ? "selected" : ""} key={child.id}><label><input type="checkbox" checked={Boolean(subject)} onChange={() => toggleSubject(child.id)} />{child.display_name}</label>{subject && <><label><input type="radio" checked={subject.role === "primary"} onChange={() => setForm((current) => ({ ...current, subjects: current.subjects.map((item) => ({ ...item, role: item.childId === child.id ? "primary" : item.role === "primary" ? "participant" : item.role })) }))} />主要观察</label><select value={subject.role} onChange={(event) => setForm((current) => { const nextRole = event.target.value as SubjectDraft["role"]; return { ...current, subjects: current.subjects.map((item) => item.childId === child.id ? { ...item, role: nextRole } : nextRole === "primary" && item.role === "primary" ? { ...item, role: "participant" } : item) }; })}><option value="primary">主要观察</option><option value="participant">共同参与</option><option value="incidental">偶发参与</option></select><input placeholder="本次情境特征" value={subject.contextualFeature} onChange={(event) => setForm((current) => ({ ...current, subjects: current.subjects.map((item) => item.childId === child.id ? { ...item, contextualFeature: event.target.value } : item) }))} /></>}</article>})}</div><div className="remote-form-grid"><label><b>未列名参与人数</b><input type="number" min="0" max="99" value={form.unlistedParticipantCount} onChange={(event) => setForm({ ...form, unlistedParticipantCount: Number(event.target.value) })} /></label><label className="full-field"><b>群体情境</b><textarea rows={2} value={form.groupContext} onChange={(event) => setForm({ ...form, groupContext: event.target.value })} /></label></div></div>
      <div className="remote-form-section"><span>03 观察、识别与原始应答</span><label><b>客观白描（含关键幼儿原话）</b><textarea required minLength={10} rows={7} value={form.teacherObservation} onChange={(event) => setForm({ ...form, teacherObservation: event.target.value })} /></label><label><b>教师识别</b><textarea required minLength={5} rows={4} value={form.teacherIdentification} onChange={(event) => setForm({ ...form, teacherIdentification: event.target.value })} /></label><div className="remote-form-grid"><label><b>原始应答类型</b><select value={form.responseCategory} onChange={(event) => setForm({ ...form, responseCategory: event.target.value })}><option value="experience">经验支持</option><option value="material">材料支持</option><option value="activity">活动支持</option></select></label><label><b>观察重点</b><input value={form.observationFocus} onChange={(event) => setForm({ ...form, observationFocus: event.target.value })} /></label><label className="full-field"><b>教师原始应答</b><textarea required minLength={2} rows={3} value={form.responseStrategy} onChange={(event) => setForm({ ...form, responseStrategy: event.target.value })} /></label><label className="full-field"><b>下一次观察重点</b><textarea required minLength={2} rows={2} value={form.nextObservationFocus} onChange={(event) => setForm({ ...form, nextObservationFocus: event.target.value })} /></label></div></div>
      <div className="remote-form-section"><span>04 媒体证据</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} /><small>图片10MB/张，视频100MB/段；上传后私有保存并关联本次观察。</small></div><button className="btn btn-primary" disabled={busy || form.subjects.length === 0} type="submit"><Save />保存教师观察</button>
    </form></Modal>}
  </div>;
}

function CurriculumContent({ plan }: { plan: RemoteCurriculumPlan }) {
  const content = plan.content as any;
  return <div className="evo-course-content">
    <section><span>01</span><h3>主题缘起</h3><p>{content.themeOrigin?.coreEmergencePoint}</p><small>{content.themeOrigin?.sourceDescription}</small></section>
    <section><span>02</span><h3>与自然、生活、自我同生</h3>{Object.entries(content.coreCompetencies ?? {}).filter(([key]) => key !== "qualities").map(([key, value]) => <p key={key}><strong>{key}：</strong>{(value as string[]).join("；")}</p>)}</section>
    <section><span>03</span><h3>预设方向与生成留白</h3>{(content.generatedPossibilities?.presetDirections ?? []).map((item: string) => <p key={item}>• {item}</p>)}<small>{content.generatedPossibilities?.opennessNote}</small></section>
    <section><span>04</span><h3>四区七步支持框架</h3>{(content.implementationFramework?.teacherSupportAndQuestions ?? []).map((item: string) => <p key={item}>• {item}</p>)}</section>
    <section><span>05</span><h3>环境、材料与家园资源</h3>{Object.entries(content.resources ?? {}).map(([key, value]) => <p key={key}><strong>{key}：</strong>{(value as string[]).join("；")}</p>)}</section>
  </div>;
}

export function RemoteCurriculumV32Page({ user }: { user: RemoteUser }) {
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]); const [classroomId, setClassroomId] = useState("");
  const [observations, setObservations] = useState<RemoteObservation[]>([]); const [clues, setClues] = useState<RemoteCurriculumClue[]>([]);
  const [templates, setTemplates] = useState<RemoteCurriculumTemplate[]>([]); const [selectedId, setSelectedId] = useState("");
  const [workspace, setWorkspace] = useState<RemoteCurriculumWorkspace | null>(null); const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); const [theme, setTheme] = useState(""); const [period, setPeriod] = useState("未来4周");
  const [evidenceModal, setEvidenceModal] = useState(false); const [cycleModal, setCycleModal] = useState(false); const [templateModal, setTemplateModal] = useState(false);
  const [templateId, setTemplateId] = useState(""); const [templateForm, setTemplateForm] = useState({ code: "co-growth-course", name: "同生课程·四区七步N循环", description: "以真实问题、共同经验和连续证据推进的园本课程模板", isDefault: true });
  const [cycle, setCycle] = useState({ zone: "starting", problem: "", description: "", key: "", direction: "", methods: "", process: "", outcome: "", reflection: "", newQuestions: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [loaded, setLoaded] = useState(false);
  const load = async () => { const [classes, observationRows, clueRows, templateRows] = await Promise.all([remoteApi.classrooms(), remoteApi.observations(), remoteApi.curriculumClues(), remoteApi.curriculumTemplates()]); const active = classes.items.filter((item) => item.status === "active"); setClassrooms(active); setClassroomId((current) => current || active[0]?.id || ""); setObservations(observationRows.items); setClues(clueRows.items); setTemplates(templateRows.items); setTemplateId((current) => current || templateRows.items[0]?.id || ""); setSelectedId((current) => current || clueRows.items[0]?.id || ""); };
  const loadWorkspace = async (id = selectedId) => { if (!id) return setWorkspace(null); const result = await remoteApi.curriculumWorkspace(id); setWorkspace(result); setSelectedOptions(result.options.filter((item) => item.status === "selected").map((item) => item.id)); };
  useEffect(() => { load().catch((reason) => setError(showError(reason))).finally(() => setLoaded(true)); }, []);
  useEffect(() => { loadWorkspace().catch((reason) => setError(showError(reason))); }, [selectedId]);
  const visible = clues.filter((item) => item.classroom_id === classroomId); const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [classroomId, selected?.id]);
  const adoptedEvidence = observations.filter((item) => item.classroom_id === classroomId && item.status === "adopted");
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(""); try { await operation(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } };
  const latestPlan = workspace?.plans[0]; const selectedTemplate = templates.find((item) => item.id === templateId) ?? templates[0];
  const exportCurriculum = () => void run(async () => {
    if (!latestPlan) return;
    const result = await remoteApi.createCurriculumDocument(latestPlan.id);
    await remoteApi.documentExportDownload(result.documentExport.id);
  });
  return <div className="page remote-page evo-page"><PageHeader eyebrow="证据选取 · 活动方向 · 课程生成 · N循环" title="游戏课程生成" description="正式班本课程以共同兴趣和连续证据为起点。AI先给4个方向，教师选择1至3个后再生成园本课程计划。" actions={<div className="page-action-row"><select className="child-select" value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setSelectedId(""); }}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{user.role === "researcher" && <button className="btn btn-secondary" onClick={() => setTemplateModal(true)}><BookOpen />模板版本</button>}<button className="btn btn-secondary" disabled={busy} onClick={() => void run(async () => { await remoteApi.scanCurriculum(classroomId); await load(); })}><BrainCircuit />语义扫描</button><button className="btn btn-primary" onClick={() => setEvidenceModal(true)}><Plus />教师选证生成</button></div>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}<div className="evo-flow"><span>1 选择连续证据</span><ArrowRight /><span>2 AI生成4个方向</span><ArrowRight /><span>3 教师选1至3个</span><ArrowRight /><span>4 深度计划与N循环</span></div>
    {!loaded ? <LoadingState /> : !selected ? <EmptyState title="尚无课程线索" description="先积累教师已确认的观察，再由教师选择证据或运行语义扫描。" action={<button className="btn btn-primary" onClick={() => setEvidenceModal(true)}>选择课程证据</button>} /> : <div className="master-detail"><Panel className="master-list" title="课程线索">{visible.map((item) => <button className={item.id === selected.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><div><Badge tone={item.threshold_met ? "green" : "orange"}>{item.threshold_met ? "达到门槛" : "继续观察"}</Badge><strong>{item.title}</strong><span>{item.child_ids.length}名幼儿 · {item.time_point_count}个时间点 · {item.evidence_observation_ids.length}条证据</span></div></button>)}</Panel><div className="detail-stack">
      <Panel><div className="evo-section-head"><div><Badge tone="green">{selected.plan.scope === "individual_support" ? "个别支持计划" : "班级生成课程"}</Badge><h2>{selected.title}</h2><p>{selected.origin}</p></div><Badge tone={tone(selected.status)}>{statusLabel[selected.status] ?? selected.status}</Badge></div><div className="evidence-chain"><strong>证据回链</strong>{selected.evidence_observation_ids.map((id) => <span className="badge" key={id}>{id.slice(0, 8)}</span>)}</div></Panel>
      <Panel title="第一步：4个可选活动方向" subtitle="价值点、核心问题、活动、材料和观察重点均可比较。" action={<button className="btn btn-secondary" disabled={busy} onClick={() => void run(async () => { await remoteApi.generateCurriculumOptions(selected.id); await loadWorkspace(selected.id); })}><Sparkles />生成/更新4个方向</button>}>
        {workspace?.options.length ? <div className="evo-course-options">{workspace.options.map((option) => <article className={selectedOptions.includes(option.id) ? "selected" : ""} key={option.id}><label><input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={() => setSelectedOptions((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : current.length < 3 ? [...current, option.id] : current)} /><strong>{option.title}</strong></label><p>{option.value_point}</p><small>核心问题：{option.core_question}</small><h4>主要活动</h4><p>{option.main_activities.join("；")}</p><h4>材料</h4><p>{option.materials.join("、")}</p><small>风险边界：{option.risk_note}</small></article>)}</div> : <EmptyState title="尚未生成活动方向" description="AI会基于教师选定证据和班级年龄段知识生成4个可比较方向。" />}
        {workspace?.options.length ? <button className="btn btn-primary" disabled={busy || selectedOptions.length < 1 || selectedOptions.length > 3} onClick={() => void run(async () => { await remoteApi.selectCurriculumOptions(selected.id, selectedOptions); await loadWorkspace(selected.id); })}><Check />确认选择{selectedOptions.length}个方向</button> : null}
      </Panel>
      <Panel title="第二步：按园本模板生成深度计划" subtitle={selectedTemplate ? `当前模板：${selectedTemplate.name} V${selectedTemplate.version}` : "当前园所尚未发布课程模板"}><div className="page-action-row">{templates.length > 1 && <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((item) => <option value={item.id} key={item.id}>{item.name} V{item.version}{item.is_default ? "（默认）" : ""}</option>)}</select>}<input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="实施周期" /><button className="btn btn-primary" disabled={busy || !selectedTemplate || !workspace?.options.some((item) => item.status === "selected")} onClick={() => void run(async () => { await remoteApi.generateCurriculumPlan(selected.id, { implementationPeriod: period, templateVersionId: selectedTemplate.id }); await loadWorkspace(selected.id); })}><BookOpen />生成深度课程计划</button></div></Panel>
      {latestPlan && <article className="curriculum-paper"><header><div><span>{selectedTemplate?.name} · 计划V{latestPlan.version}</span><h1>{latestPlan.title}</h1><p>{latestPlan.implementation_period} · 核心探究：{latestPlan.core_inquiry_clue}</p></div><div className="page-action-row"><button className="btn btn-secondary" onClick={() => setCycleModal(true)}><Plus />记录第N轮</button><button className="btn btn-secondary" disabled={busy} onClick={exportCurriculum}><Download />导出Word</button></div></header><CurriculumContent plan={latestPlan} /><div className="evidence-chain"><strong>N次循环记录</strong>{workspace?.cycles.filter((item) => item.curriculum_plan_id === latestPlan.id).map((item) => <article key={item.id}><Badge tone="blue">第{item.cycle_number}轮</Badge><strong>{({ starting: "起始区", focusing: "聚焦区", inquiring: "探究区", resolving: "解决区/新起始区" } as const)[item.zone]}</strong><p>{item.reflection}</p><small>新问题：{item.new_questions.join("；") || "待记录"}</small></article>)}</div></article>}
    </div></div>}
    {evidenceModal && <Modal wide title="选择生成课程的连续观察证据" description="至少2条、2个时间点，且涉及2名幼儿或同一幼儿连续3次；只显示教师已确认采用的观察。" onClose={() => setEvidenceModal(false)}><div className="remote-form"><label><span>课程主题（可留空使用首条观察主题）</span><input value={theme} onChange={(event) => setTheme(event.target.value)} /></label><div className="evo-evidence-picker">{adoptedEvidence.map((item) => <label className={selectedEvidence.includes(item.id) ? "selected" : ""} key={item.id}><input type="checkbox" checked={selectedEvidence.includes(item.id)} onChange={() => setSelectedEvidence((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><strong>{item.title}</strong><span>{new Date(item.occurred_at).toLocaleDateString("zh-CN")} · {item.scene} · {item.theme}</span></label>)}</div><button className="btn btn-primary" disabled={busy || selectedEvidence.length < 2} onClick={() => void run(async () => { const result = await remoteApi.createCurriculumFromEvidence({ classroomId, observationIds: selectedEvidence, theme: theme || undefined }); setEvidenceModal(false); await load(); setSelectedId(result.item.id); })}><CheckCircle2 />形成课程线索</button></div></Modal>}
    {cycleModal && latestPlan && <Modal wide title="记录下一轮四区七步探究" description="每轮以真实问题开始，以经验生成和新问题结束。" onClose={() => setCycleModal(false)}><form className="remote-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await remoteApi.createCurriculumCycle(latestPlan.id, { zone: cycle.zone, sevenSteps: { 发现真问题: cycle.problem, 详细描述问题表现: cycle.description, 明确问题关键: cycle.key, 确定解决方向: cycle.direction, 探索解决方法: cycle.methods, 实施方案与过程: cycle.process, 解决当下问题并发现新问题: cycle.outcome }, teacherSupport: [], childActivities: [], environmentMaterials: [], generatedExperience: lines(cycle.reflection), newQuestions: lines(cycle.newQuestions), evidenceObservationIds: [], reflection: cycle.reflection, status: "active" }); setCycleModal(false); await loadWorkspace(selected.id); }); }}><label><span>当前区域</span><select value={cycle.zone} onChange={(event) => setCycle({ ...cycle, zone: event.target.value })}><option value="starting">起始区</option><option value="focusing">聚焦区</option><option value="inquiring">探究区</option><option value="resolving">解决区/新起始区</option></select></label>{[["problem", "1 发现真问题"], ["description", "2 详细描述问题表现"], ["key", "3 明确问题关键"], ["direction", "4 确定解决方向"], ["methods", "5 探索解决方法"], ["process", "6 实施方案与过程"], ["outcome", "7 解决问题并发现新问题"], ["reflection", "本轮反思与经验生成"], ["newQuestions", "新问题走向"]].map(([key, label]) => <label className="full-field" key={key}><span>{label}</span><textarea required rows={2} value={(cycle as any)[key]} onChange={(event) => setCycle({ ...cycle, [key]: event.target.value })} /></label>)}<button className="btn btn-primary" disabled={busy}><Save />保存本轮记录</button></form></Modal>}
    {templateModal && <Modal title="新建课程模板版本" description="以当前模板为结构底稿，创建园所独立版本；历史课程仍保留原模板回链。" onClose={() => setTemplateModal(false)}><form className="remote-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const fallback = { sections: ["主题缘起", "幼儿已有经验", "核心探究问题", "关键经验", "四区七步实施", "环境材料", "家园资源", "观察与调整"] }; await remoteApi.createCurriculumTemplate({ ...templateForm, structure: selectedTemplate?.structure ?? fallback }); setTemplateModal(false); await load(); }); }}><label><span>模板编码</span><input required minLength={2} value={templateForm.code} onChange={(event) => setTemplateForm({ ...templateForm, code: event.target.value })} /></label><label><span>模板名称</span><input required minLength={2} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /></label><label><span>版本说明</span><textarea required minLength={2} rows={3} value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} /></label><label><input type="checkbox" checked={templateForm.isDefault} onChange={(event) => setTemplateForm({ ...templateForm, isDefault: event.target.checked })} />设为园所默认模板</label><button className="btn btn-primary" disabled={busy}><Save />保存新版本</button></form></Modal>}
  </div>;
}

const memoryTypeLabel: Record<RemoteProfessionalMemory["memory_type"], string> = {
  teacher_feedback: "教师修订经验", response_effect: "应答效果", approved_case: "优秀案例",
  curriculum_reflection: "课程复盘", school_knowledge: "园本知识",
};

export function RemoteProfessionalMemoryPage({ user }: { user: RemoteUser }) {
  const [items, setItems] = useState<RemoteProfessionalMemory[]>([]);
  const [frameworks, setFrameworks] = useState<RemoteAnalysisFramework[]>([]);
  const [frameworkModal, setFrameworkModal] = useState(false);
  const dimensionDefaults = {
    game_experience: ["计划与意图", "材料使用", "角色与情节", "问题解决", "合作协商", "规则与自我调节", "表达与回顾"],
    learning_disposition: ["好奇与探究", "主动性", "专注与坚持", "想象与创造", "合作", "反思与调整"],
  } as const;
  const [frameworkForm, setFrameworkForm] = useState<{ frameworkType: RemoteAnalysisFramework["framework_type"]; code: string; name: string; description: string; isDefault: boolean; dimensions: Array<{ label: string; evidenceReminder: string }> }>({ frameworkType: "learning_disposition", code: "LEARNING_DISPOSITION_6", name: "学习品质六维框架", description: "依据真实游戏行为线索描述学习品质，避免固定人格标签。", isDefault: true, dimensions: dimensionDefaults.learning_disposition.map((label) => ({ label, evidenceReminder: `请结合可回溯行为描述“${label}”，证据不足时不作判断。` })) });
  const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState("");
  const loadMemories = async () => { const result = await remoteApi.professionalMemories(); setItems(result.items.filter((item) => item.status !== "disabled")); };
  const loadFrameworks = async () => { const result = await remoteApi.analysisFrameworks(); setFrameworks(result.items); };
  useEffect(() => { Promise.all([loadMemories(), loadFrameworks()]).catch((reason) => setError(showError(reason))).finally(() => setLoaded(true)); }, []);
  return <div className="page remote-page evo-page experience-page"><PageHeader eyebrow="园本沉淀 · 证据回链" title="园所经验库" description="系统自动沉淀教师确认的AI分析、复察有效的应答和课程反思，供后续观察与课程设计参考；不用于训练通用模型。" actions={<button className="btn btn-secondary" onClick={() => void loadMemories()}><RefreshCcw />刷新</button>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}
    {!loaded ? <LoadingState /> : <><Panel title="园本分析框架" subtitle="框架用于约束AI观察角度和证据提醒；不生成总分、排名或人格标签。" action={user.role === "researcher" ? <button className="btn btn-secondary" onClick={() => setFrameworkModal(true)}><Plus />发布新版本</button> : undefined}><div className="evo-framework-list">{frameworks.filter((item) => item.is_default).map((item) => <article key={item.id}><div><Badge tone="blue">{item.framework_type === "game_experience" ? "游戏经验" : "学习品质"}</Badge><strong>{item.name} · V{item.version}</strong></div><p>{item.description}</p><small>{item.dimensions.map((dimension) => dimension.label).join(" · ")}</small></article>)}</div></Panel>{items.length === 0 ? <EmptyState title="暂无可用园本经验" description="完成教师确认、应答复察或课程复盘后，系统会自动形成带证据来源的园本经验。" /> : <div className="evo-memory-grid">{items.map((item) => <Panel key={item.id}><div className="evo-section-head"><div><Badge tone="green">{memoryTypeLabel[item.memory_type]}</Badge><h3>{item.title}</h3></div><span className="memory-source-tag">可用于AI参考</span></div><p>{item.summary}</p><details><summary>查看检索文本与证据来源</summary><p>{item.retrieval_text}</p><small>来源：{item.source_resource_type} · {item.source_resource_id}</small></details></Panel>)}</div>}</>}
    {frameworkModal && <Modal wide title="发布园本分析框架版本" description="首期完整保留七类游戏经验或六类学习品质，可调整顺序和每一维的证据提醒。" onClose={() => setFrameworkModal(false)}><form className="remote-form" onSubmit={(event) => { event.preventDefault(); void (async () => { setBusy(true); setError(""); try { await remoteApi.createAnalysisFramework(frameworkForm); setFrameworkModal(false); await loadFrameworks(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } })(); }}><label><span>框架类型</span><select value={frameworkForm.frameworkType} onChange={(event) => { const frameworkType = event.target.value as RemoteAnalysisFramework["framework_type"]; const labels = dimensionDefaults[frameworkType]; setFrameworkForm({ ...frameworkForm, frameworkType, code: frameworkType === "game_experience" ? "GAME_EXPERIENCE_7" : "LEARNING_DISPOSITION_6", name: frameworkType === "game_experience" ? "游戏经验七维框架" : "学习品质六维框架", dimensions: labels.map((label) => ({ label, evidenceReminder: `请结合可回溯行为描述“${label}”，证据不足时不作判断。` })) }); }}><option value="game_experience">游戏经验</option><option value="learning_disposition">学习品质</option></select></label><label><span>框架编码</span><input required value={frameworkForm.code} onChange={(event) => setFrameworkForm({ ...frameworkForm, code: event.target.value })} /></label><label><span>框架名称</span><input required value={frameworkForm.name} onChange={(event) => setFrameworkForm({ ...frameworkForm, name: event.target.value })} /></label><label><span>版本说明</span><textarea required rows={3} value={frameworkForm.description} onChange={(event) => setFrameworkForm({ ...frameworkForm, description: event.target.value })} /></label>{frameworkForm.dimensions.map((dimension, index) => <label key={dimension.label}><span>{dimension.label}的证据提醒</span><textarea required rows={2} value={dimension.evidenceReminder} onChange={(event) => setFrameworkForm({ ...frameworkForm, dimensions: frameworkForm.dimensions.map((item, itemIndex) => itemIndex === index ? { ...item, evidenceReminder: event.target.value } : item) })} /></label>)}<label><input type="checkbox" checked={frameworkForm.isDefault} onChange={(event) => setFrameworkForm({ ...frameworkForm, isDefault: event.target.checked })} />发布后设为该类型默认版本</label><button className="btn btn-primary" disabled={busy}><Save />发布新版本</button></form></Modal>}
  </div>;
}
