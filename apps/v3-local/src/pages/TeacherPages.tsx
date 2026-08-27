import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, BookOpen, BrainCircuit, CalendarDays,
  Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Download, FileCheck2,
  FileText, Film, Image, Info, Layers3, Lightbulb, Link2, MessageSquareText,
  Import, PencilLine, Play, Plus, Printer, Save, Search, ShieldCheck, Sparkles, Sprout,
  Target, Upload, Users, Video, X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AIAnalysisRun, AnalysisClaim, ChildImportRow, GamePlan, NewEvidencePackageInput, SupportAction } from "../domain/types";
import { useAppStore } from "../store/useAppStore";
import { Avatar, Badge, EmptyState, Metric, Modal, PageHeader, Panel, ProgressBar } from "../components/ui";
import { Link } from "../router";
import { makeId } from "../services/localRepository";
import { TENANT_ID } from "../data/seed";

const dateLabel = (value: string) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(value));
const fullDate = (value: string) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const tone = (status: string): "green" | "orange" | "blue" | "purple" | "gray" | "red" => /已整合|已发布|有效|通过|启用|已确认/.test(status) ? "green" : /待|草稿|不足|继续/.test(status) ? "orange" : /拒绝|退回|停用/.test(status) ? "red" : /提交|审核|实施/.test(status) ? "blue" : "gray";
const nextSupportStatus: Record<SupportAction["status"], SupportAction["status"]> = { "待确认": "待实施", "待实施": "已实施", "已实施": "待复察", "待复察": "已关联证据", "已关联证据": "有效", "有效": "待继续验证", "待继续验证": "待复察" };

function ProcessRail({ active = 1 }: { active?: number }) {
  const steps = ["教师观察", "教师识别", "教师应答", "提交原稿", "AI对照", "教师整合", "复察验证"];
  return <div className="process-rail">{steps.map((step, index) => <div className={index < active ? "done" : index === active ? "active" : ""} key={step}><i>{index < active ? <Check size={12} /> : index + 1}</i><span>{step}</span>{index < steps.length - 1 && <b />}</div>)}</div>;
}

export function TodayPage() {
  const { role, evidencePackages, supportActions, individualReports, curriculumClues, qualityReviews, exportRequests, children, selectPackage } = useAppStore();
  const pending = evidencePackages.filter((item) => item.status === "教师草稿" || item.status === "教师已提交" || item.status === "待对照审核");
  const longUnobserved = children.filter((item) => new Date(item.lastObservedAt) < new Date("2026-08-01"));
  const title = role === "teacher" ? "今天，从教师的判断开始" : role === "research_admin" ? "教研治理工作台" : "园所游戏学习总览";
  return <div className="page">
    <PageHeader eyebrow="TONGJI 3.0 · TODAY" title={title} description={role === "teacher" ? "先写下您看见、理解和准备怎样支持，再让模拟 AI 提供可追溯的对照视角。" : role === "research_admin" ? "独立查看观察质量、审批外发数据，并组织基于共同证据的教研。" : "查看证据覆盖、支持闭环和课程生长，不查看幼儿排名。"} actions={role === "teacher" ? <Link className="btn btn-primary" to="/evidence"><Plus />新建证据包</Link> : undefined} />
    <div className="v3-hero">
      <div><Badge tone="orange">3.0 核心变化</Badge><h2>教师原始专业判断被完整保留，AI 只做第二视角。</h2><p>同一工作台串联观察、识别与应答。提交后的原稿不会被 AI 覆盖，每个结论都能回到具体幼儿、情境和媒体片段。</p><ProcessRail active={4} /></div>
      <div className="hero-proof"><ShieldCheck /><strong>三条不可越过的边界</strong><span>未提交教师原稿，不运行 AI</span><span>未逐条审核，不进入成长轨迹</span><span>单次观察，不形成稳定能力结论</span></div>
    </div>
    <div className="metrics-row">
      <Metric icon={<Activity />} value={evidencePackages.length} label="连续证据包" detail={`${pending.length} 项仍在处理`} />
      <Metric icon={<Target />} value={`${supportActions.filter((item) => item.followUpPackageId).length}/${supportActions.length}`} label="支持已有复察" detail="检验教师支持是否有效" tone="blue" />
      <Metric icon={<FileText />} value={individualReports.filter((item) => item.status !== "草稿").length} label="可交流报告" detail={`${individualReports.filter((item) => item.status === "草稿").length} 份仍为草稿`} tone="orange" />
      <Metric icon={<BookOpen />} value={curriculumClues.filter((item) => item.thresholdMet).length} label="成熟课程线索" detail="均回链多时间点证据" tone="purple" />
    </div>
    {role === "teacher" ? <div className="dashboard-grid">
      <Panel title="待完成的专业闭环" subtitle="按证据成熟度排序，而不是按 AI 分数排序">
        <div className="task-list">{pending.slice(0, 5).map((pkg) => <button key={pkg.id} onClick={() => selectPackage(pkg.id)}><span className="task-dot" /><div><strong>{pkg.title}</strong><p>{pkg.theme} · {dateLabel(pkg.observedAt)} · {pkg.scene}</p></div><Badge tone={tone(pkg.status)}>{pkg.status}</Badge><Link to="/evidence"><ChevronRight /></Link></button>)}</div>
      </Panel>
      <Panel title="观察机会提醒" subtitle="提示长期没有被重点观察的幼儿，不评价能力"><div className="attention-cards">{longUnobserved.map((child) => <article key={child.id}><Avatar child={child} /><div><strong>{child.alias}</strong><p>最近重点观察：{dateLabel(child.lastObservedAt)}</p></div><Badge tone="orange">建议安排</Badge></article>)}</div></Panel>
    </div> : <div className="dashboard-grid">
      <Panel title="治理待办" subtitle="四项能力均有独立入口与审计轨迹"><div className="governance-grid">
        <Link to="/quality"><ClipboardIcon /><strong>{qualityReviews.filter((item) => item.status === "待审核").length} 项观察质量待审</strong><span>独立于发展结论，检查白描质量</span></Link>
        <Link to="/exports"><FileCheck2 /><strong>{exportRequests.filter((item) => item.status === "待审批").length} 项导出待批</strong><span>审批用途、接收方和匿名化条件</span></Link>
        <Link to="/research"><Users /><strong>1 场证据教研待开展</strong><span>同一视频，多组观察对照</span></Link>
        <Link to="/classroom"><BarChart3 /><strong>2 名幼儿需补观察</strong><span>只提示机会缺口，不做排名</span></Link>
      </div></Panel>
      <Panel title="本周期可信度提示"><div className="principle-list"><p><CheckCircle2 />已整合证据均保留教师原稿与 AI 版本</p><p><CheckCircle2 />课程线索均检查幼儿数和时间点</p><p><CircleAlert />健康与艺术领域覆盖仍低于其他领域</p></div></Panel>
    </div>}
  </div>;
}

function ClipboardIcon() { return <Activity />; }

function ChildrenImportModal({ onClose }: { onClose: () => void }) {
  const { importChildren, busy } = useAppStore();
  const [rows, setRows] = useState<ChildImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const parseCsv = (text: string) => {
    const result: string[][] = [];
    let row: string[] = [], cell = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
      } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row = []; cell = "";
      } else cell += char;
    }
    row.push(cell.trim()); if (row.some(Boolean)) result.push(row);
    return result;
  };

  const parseFile = async (file: File) => {
    const table: unknown[][] = file.name.toLowerCase().endsWith(".csv")
      ? parseCsv((await file.text()).replace(/^\uFEFF/, ""))
      : await (await import("read-excel-file/browser")).readSheet(file) as unknown[][];
    const headers = (table[0] || []).map((value) => String(value ?? "").trim());
    const parsed = table.slice(1).map((values) => {
      const item = Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
      return {
        name: item["姓名"] || item.name || "", alias: item["园内使用名"] || item.alias || item["姓名"] || "",
        birthMonth: item["出生年月"] || item.birthMonth || "", classroomName: item["班级"] || item.classroomName || "大一班",
        grade: (item["年级"] || item.grade || "大班") as ChildImportRow["grade"],
        consentStatus: (item["授权状态"] || item.consentStatus || "未授权") as ChildImportRow["consentStatus"],
      } satisfies ChildImportRow;
    });
    const nextErrors = parsed.flatMap((item, index) => {
      const list: string[] = [];
      if (!item.name) list.push(`第 ${index + 2} 行缺少姓名`);
      if (!/^\d{4}-\d{2}$/.test(item.birthMonth)) list.push(`第 ${index + 2} 行出生年月应为 YYYY-MM`);
      if (!["小班", "中班", "大班"].includes(item.grade)) list.push(`第 ${index + 2} 行年级无效`);
      if (!["已授权", "部分授权", "未授权"].includes(item.consentStatus)) list.push(`第 ${index + 2} 行授权状态无效`);
      return list;
    });
    setRows(parsed); setErrors(nextErrors);
  };

  const downloadTemplate = () => {
    const csv = "\uFEFF姓名,园内使用名,出生年月,班级,年级,授权状态\n示例幼儿,小名,2020-06,大一班,大班,已授权\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "同迹幼儿导入模板.csv"; anchor.click(); URL.revokeObjectURL(url);
  };

  return <Modal title="批量导入幼儿" description="支持 CSV 与 XLSX，先在本地解析、校验和预览，再写入浏览器数据库。" onClose={onClose} wide>
    <div className="import-zone"><Import size={32} /><div><strong>选择幼儿名单</strong><span>文件不会上传外部服务；重复姓名与出生年月会被拦截。</span></div><label className="btn btn-secondary">选择文件<input type="file" accept=".csv,.xlsx" onChange={(event) => event.target.files?.[0] && void parseFile(event.target.files[0])} /></label><button className="text-link" onClick={downloadTemplate}><Download />下载模板</button></div>
    {errors.length > 0 && <div className="error-list"><CircleAlert /><div>{errors.map((item) => <p key={item}>{item}</p>)}</div></div>}
    {rows.length > 0 && <div className="table-wrap"><table><thead><tr><th>姓名</th><th>园内名</th><th>出生年月</th><th>班级</th><th>年级</th><th>授权</th></tr></thead><tbody>{rows.slice(0, 8).map((item, index) => <tr key={`${item.name}-${index}`}><td>{item.name}</td><td>{item.alias}</td><td>{item.birthMonth}</td><td>{item.classroomName}</td><td>{item.grade}</td><td><Badge tone={tone(item.consentStatus)}>{item.consentStatus}</Badge></td></tr>)}</tbody></table></div>}
    <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={!rows.length || errors.length > 0 || busy} onClick={async () => { await importChildren(rows); onClose(); }}>{busy ? "正在导入…" : `确认导入 ${rows.length || ""} 名幼儿`}</button></div>
  </Modal>;
}

export function ChildrenPage() {
  const { children, evidencePackages, observationSubjects, selectChild } = useAppStore();
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const filtered = children.filter((child) => `${child.name}${child.alias}${child.interests.join("")}`.includes(query));
  const coverage = (childId: string) => new Set(observationSubjects.filter((item) => item.childId === childId).map((item) => item.evidencePackageId)).size;
  return <div className="page">
    <PageHeader eyebrow="CHILDREN & OPPORTUNITY" title="幼儿与观察机会" description="名单是持续追踪的入口；数字表示获得了多少次观察机会，不是能力得分。" actions={<button className="btn btn-secondary" onClick={() => setShowImport(true)}><Upload />导入幼儿名单</button>} />
    <div className="metrics-row"><Metric icon={<Users />} value={children.length} label="大一班幼儿" detail="全部为虚构演示数据" /><Metric icon={<Video />} value={evidencePackages.length} label="证据包" detail="含文字、视频和作品" tone="blue" /><Metric icon={<ShieldCheck />} value={children.filter((item) => item.consentStatus === "已授权").length} label="完整授权" detail="部分授权会限制媒体处理" tone="orange" /></div>
    <Panel><div className="toolbar"><label className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、园内名或兴趣" /></label><Badge tone="gray">仅展示个体纵向变化</Badge></div>
      <div className="children-grid">{filtered.map((child) => <article className="child-card" key={child.id}><div className="child-card-top"><Avatar child={child} size="lg" /><div><h3>{child.alias}</h3><p>{child.name} · {child.grade}</p></div><Badge tone={tone(child.consentStatus)}>{child.consentStatus}</Badge></div><div className="coverage-line"><span>重点或关联观察</span><strong>{coverage(child.id)} 次</strong></div><ProgressBar value={Math.min(100, coverage(child.id) * 20)} /><div className="interest-tags">{child.interests.map((item) => <Badge key={item} tone="gray">{item}</Badge>)}</div><div className="child-card-actions"><Link to="/growth" onClick={() => selectChild(child.id)}>查看个体轨迹</Link><Link to="/evidence" onClick={() => selectChild(child.id)}>为TA观察 <ArrowRight /></Link></div></article>)}</div>
    </Panel>{showImport && <ChildrenImportModal onClose={() => setShowImport(false)} />}
  </div>;
}

function GamePlanModal({ initial, onClose }: { initial?: GamePlan; onClose: () => void }) {
  const { saveGamePlan } = useAppStore();
  const [form, setForm] = useState({
    title: initial?.title || "", scene: initial?.scene || "建构区", rationale: initial?.rationale || "",
    materials: initial?.materials.join("、") || "", reflection: initial?.reflection || "",
    scienceGoal: initial?.goals[0]?.statement || "", observationFocus: initial?.goals[0]?.observationFocus || "",
  });
  const submit = async () => {
    const now = new Date().toISOString();
    const plan: GamePlan = initial ? { ...initial } : {
      id: makeId("plan"), tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1,
      classroomId: "class-1", title: form.title, scene: form.scene, ageBand: "5-6岁", rationale: form.rationale,
      goals: [], materials: [], stages: [], evaluationFocus: [], reflection: form.reflection, status: "草稿",
    };
    plan.title = form.title; plan.scene = form.scene; plan.rationale = form.rationale; plan.reflection = form.reflection;
    plan.materials = form.materials.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
    plan.goals = [{ id: initial?.goals[0]?.id || makeId("goal"), domain: "科学", statement: form.scienceGoal, observationFocus: form.observationFocus }];
    if (!plan.stages.length) plan.stages = ["游戏计划", "游戏导入", "游戏过程", "游戏分享", "游戏评价"].map((stage) => ({ stage: stage as GamePlan["stages"][number]["stage"], content: stage === "游戏过程" ? "教师连续记录关键事件，在安全前提下延迟介入。" : "依据幼儿已有经验开放材料与表达空间。" }));
    if (!plan.evaluationFocus.length) plan.evaluationFocus = [form.observationFocus];
    await saveGamePlan(plan); onClose();
  };
  return <Modal title={initial ? "编辑游戏计划" : "新建游戏计划"} description="计划用于提供分析上下文，不规定所有幼儿必须走同一路径。" onClose={onClose} wide>
    <div className="form-grid"><label><span>计划名称</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label><span>主要场地</span><select value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })}>{["建构区", "沙水区", "角色区", "光影区", "自然角", "户外运动场"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="full-field"><span>课程缘起与真实问题</span><textarea rows={4} value={form.rationale} onChange={(event) => setForm({ ...form, rationale: event.target.value })} /></label><label className="full-field"><span>关键目标</span><input value={form.scienceGoal} onChange={(event) => setForm({ ...form, scienceGoal: event.target.value })} /></label><label className="full-field"><span>对应观察重点</span><input value={form.observationFocus} onChange={(event) => setForm({ ...form, observationFocus: event.target.value })} /></label><label className="full-field"><span>环境与材料（顿号分隔）</span><input value={form.materials} onChange={(event) => setForm({ ...form, materials: event.target.value })} /></label><label className="full-field"><span>教师反思</span><textarea rows={3} value={form.reflection} onChange={(event) => setForm({ ...form, reflection: event.target.value })} /></label></div>
    <div className="confirm-card"><Info /><div><strong>五阶段结构会随计划一起保存</strong><p>游戏计划、导入、过程、分享和评价均可作为后续证据分析的背景，但不会替代现场观察。</p></div></div>
    <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={!form.title || !form.rationale || !form.scienceGoal} onClick={() => void submit()}><Save />保存计划</button></div>
  </Modal>;
}

export function GamePlansPage() {
  const { gamePlans, evidencePackages } = useAppStore();
  const [selectedId, setSelectedId] = useState(gamePlans[0]?.id);
  const [editing, setEditing] = useState<GamePlan | "new" | null>(null);
  const plan = gamePlans.find((item) => item.id === selectedId) || gamePlans[0];
  if (!plan) return <EmptyState title="还没有游戏计划" description="游戏计划是可选情境，不会阻止记录生成性游戏。" />;
  const linked = evidencePackages.filter((item) => item.gamePlanId === plan.id);
  return <div className="page"><PageHeader eyebrow="GAME PLAN" title="游戏计划与实施脉络" description="计划提供目标和观察背景，但现场真实问题始终优先；没有计划也可以创建证据包。" actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><Plus />新建计划</button>} />
    <div className="master-detail"><Panel className="master-list" title="本班游戏计划">{gamePlans.map((item) => <button className={item.id === plan.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><div><Badge tone={tone(item.status)}>{item.status}</Badge><strong>{item.title}</strong><span>{item.scene} · {item.ageBand}</span></div><ChevronRight /></button>)}</Panel>
      <div className="detail-stack"><Panel><div className="detail-title"><div><Badge tone="blue">{plan.scene}</Badge><h2>{plan.title}</h2><p>{plan.rationale}</p></div><button className="btn btn-secondary" onClick={() => setEditing(plan)}><PencilLine />编辑计划</button></div><div className="goal-grid">{plan.goals.map((goal) => <article key={goal.id}><Badge tone="green">{goal.domain}</Badge><strong>{goal.statement}</strong><p>观察重点：{goal.observationFocus}</p></article>)}</div></Panel>
      <Panel title="游戏组织五阶段"><div className="stage-timeline">{plan.stages.map((stage, index) => <article key={stage.stage}><i>{index + 1}</i><div><strong>{stage.stage}</strong><p>{stage.content}</p></div></article>)}</div></Panel>
      <div className="dashboard-grid"><Panel title="环境与材料"><div className="chip-list">{plan.materials.map((item) => <Badge key={item} tone="gray">{item}</Badge>)}</div><p className="reflection">教师反思：{plan.reflection}</p></Panel><Panel title="已关联现场证据"><strong className="big-number">{linked.length}</strong><span className="muted"> 个证据包</span><div className="mini-links">{linked.map((item) => <Link key={item.id} to="/evidence">{dateLabel(item.observedAt)} · {item.title}</Link>)}</div></Panel></div></div>
    </div>{editing && <GamePlanModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
  </div>;
}

function NewEvidenceModal({ onClose }: { onClose: () => void }) {
  const { children, gamePlans, observationFocuses, selectedChildId, createEvidence, busy } = useAppStore();
  const [childIds, setChildIds] = useState<string[]>([selectedChildId || children[0]?.id].filter(Boolean));
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ title: "", observedAt: new Date().toISOString().slice(0, 16), durationMinutes: 18, scene: "建构区", theme: "", focusIds: ["focus-problem"], gamePlanId: "", teacherObservation: "", childQuote: "", teacherIdentification: "", responseCategory: "材料支持" as const, responseStrategy: "", nextObservationFocus: "" });
  const toggleChild = (id: string) => setChildIds(childIds.includes(id) ? childIds.filter((item) => item !== id) : [...childIds, id]);
  const toggleFocus = (id: string) => setForm({ ...form, focusIds: form.focusIds.includes(id) ? form.focusIds.filter((item) => item !== id) : [...form.focusIds, id] });
  const submit = async () => {
    const input: NewEvidencePackageInput = { childIds, title: form.title, observedAt: new Date(form.observedAt).toISOString(), durationMinutes: form.durationMinutes, scene: form.scene, theme: form.theme, observationFocusIds: form.focusIds, gamePlanId: form.gamePlanId || undefined, teacherObservation: form.teacherObservation, childQuote: form.childQuote, teacherIdentification: form.teacherIdentification, responseCategory: form.responseCategory, responseStrategy: form.responseStrategy, nextObservationFocus: form.nextObservationFocus, files };
    await createEvidence(input); onClose();
  };
  return <Modal title="新建游戏证据包" description="同一情境中的教师记录、幼儿、媒体和后续判断会形成一个可追溯证据包。" onClose={onClose} wide>
    <div className="stepper">{["情境与幼儿", "教师观察", "教师识别与应答", "媒体与保存"].map((item, index) => <span className={step >= index + 1 ? "active" : ""} key={item}><i>{index + 1}</i>{item}</span>)}</div>
    {step === 1 && <div className="form-grid"><label><span>证据包标题</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：桥面第一次掉车" /></label><label><span>观察时间</span><input type="datetime-local" value={form.observedAt} onChange={(e) => setForm({ ...form, observedAt: e.target.value })} /></label><label><span>游戏场地</span><select value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })}>{["建构区", "沙水区", "角色区", "光影区", "自然角", "户外运动场"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>游戏主题</span><input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="幼儿正在玩的真实主题" /></label><label><span>持续时间（分钟）</span><input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label><label><span>关联游戏计划（可选）</span><select value={form.gamePlanId} onChange={(e) => setForm({ ...form, gamePlanId: e.target.value })}><option value="">不关联，记录生成性游戏</option>{gamePlans.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><fieldset className="full-field"><legend>观察幼儿（第一名为主要观察）</legend><div className="child-checks">{children.map((child) => <button type="button" className={childIds.includes(child.id) ? "selected" : ""} onClick={() => toggleChild(child.id)} key={child.id}><Avatar child={child} size="sm" /><span>{child.alias}</span>{childIds.includes(child.id) && <Check />}</button>)}</div></fieldset><fieldset className="full-field"><legend>观察焦点</legend><div className="focus-checks">{observationFocuses.map((focus) => <button type="button" className={form.focusIds.includes(focus.id) ? "selected" : ""} onClick={() => toggleFocus(focus.id)} key={focus.id}><strong>{focus.name}</strong><small>{focus.description}</small></button>)}</div></fieldset></div>}
    {step === 2 && <div className="teacher-original-form"><div className="form-principle"><ShieldCheck /><div><strong>只写看得见、听得到的事实</strong><span>动作、原话、材料、顺序和持续时间。先不要写“聪明”“能力强”或诊断性语言。</span></div></div><label><span>客观白描</span><textarea rows={10} value={form.teacherObservation} onChange={(e) => setForm({ ...form, teacherObservation: e.target.value })} placeholder="例：幼儿让汽车连续两次通过弯道，均从外侧掉下。她停下看掉落位置，把圆柱向里移动约一掌宽……" /></label><label><span>幼儿原话</span><textarea rows={3} value={form.childQuote} onChange={(e) => setForm({ ...form, childQuote: e.target.value })} placeholder="保留原话，不改写成成人术语" /></label></div>}
    {step === 3 && <div className="teacher-original-form"><div className="layer-notice"><span className="layer layer-interpret">识别</span><p>您认为关键行为背后可能是什么经验？明确使用“可能”“初步看见”，并写下证据缺口。</p></div><label><span>教师自主识别</span><textarea rows={6} value={form.teacherIdentification} onChange={(e) => setForm({ ...form, teacherIdentification: e.target.value })} placeholder="基于上面的事实，写下当前经验、兴趣、困难或待验证问题" /></label><div className="layer-notice"><span className="layer layer-response">应答</span><p>应答是教师下一步准备怎样支持，不等于直接教给答案；实施后还要复察效果。</p></div><div className="form-grid"><label><span>支持类别</span><select value={form.responseCategory} onChange={(e) => setForm({ ...form, responseCategory: e.target.value as typeof form.responseCategory })}>{["经验支持", "材料支持", "活动支持"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="full-field"><span>准备怎样支持</span><textarea rows={4} value={form.responseStrategy} onChange={(e) => setForm({ ...form, responseStrategy: e.target.value })} /></label><label className="full-field"><span>下一次重点观察什么</span><textarea rows={3} value={form.nextObservationFocus} onChange={(e) => setForm({ ...form, nextObservationFocus: e.target.value })} /></label></div></div>}
    {step === 4 && <div><label className="media-drop"><Video size={32} /><strong>上传幼儿视频片段、照片、作品或观察表</strong><span>视频≤100MB，其他≤10MB，最多5项。视频保存后可运行模拟行为分析。</span><input type="file" multiple accept="image/*,video/*,.doc,.docx,.pdf" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} /></label>{files.length > 0 && <div className="file-list">{files.map((file) => <div key={`${file.name}-${file.size}`}>{file.type.startsWith("video/") ? <Film /> : <Image />}<span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button onClick={() => setFiles(files.filter((item) => item !== file))}><X /></button></div>)}</div>}<div className="confirm-card"><Info /><div><strong>保存后仍是教师草稿</strong><p>您需要在工作台确认并提交原始判断，模拟 AI 才会解锁。上传视频不会自动生成正式评价。</p></div></div></div>}
    <div className="modal-actions"><button className="btn btn-ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? "取消" : "上一步"}</button>{step < 4 ? <button className="btn btn-primary" disabled={step === 1 && (!form.title || !form.theme || !childIds.length)} onClick={() => setStep(step + 1)}>下一步 <ArrowRight /></button> : <button className="btn btn-primary" disabled={busy || (!form.teacherObservation.trim() && !files.length)} onClick={() => void submit()}>保存教师草稿</button>}</div>
  </Modal>;
}

function ClaimCard({ claim }: { claim: AnalysisClaim }) {
  const { reviewClaim } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(claim.teacherRevision || claim.content);
  return <article className={`claim-card claim-${claim.layer}`}><header><span className={`layer layer-${claim.layer === "事实" ? "fact" : claim.layer === "解释" ? "interpret" : "hypothesis"}`}>{claim.layer}</span><Badge tone={tone(claim.reviewStatus)}>{claim.reviewStatus}</Badge></header>{editing ? <textarea rows={4} value={revision} onChange={(e) => setRevision(e.target.value)} /> : <p>{claim.teacherRevision || claim.content}</p>}<div className="claim-meta"><span><Link2 />{claim.evidenceAnchors.map((item) => item.label).join("、")}</span><span>AI置信度 {Math.round(claim.confidence * 100)}%</span></div>{claim.indicatorCodes.length > 0 && <div className="chip-list">{claim.indicatorCodes.map((item) => <Badge tone="blue" key={item}>{item}</Badge>)}</div>}<footer>{editing ? <><button className="btn btn-primary btn-sm" onClick={() => { void reviewClaim(claim, "修改后采用", revision); setEditing(false); }}>保存修订</button><button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>取消</button></> : <><button onClick={() => void reviewClaim(claim, "已采用")}><Check />采用</button><button onClick={() => setEditing(true)}><PencilLine />修改</button><button onClick={() => void reviewClaim(claim, "已拒绝")}><X />拒绝</button><button onClick={() => void reviewClaim(claim, "待验证")}><Clock3 />待验证</button></>}</footer></article>;
}

function DevelopmentReferencePanel({ runs }: { runs: AIAnalysisRun[] }) {
  return <Panel title="班级年龄参照与证据判断" subtitle="只说明本次证据与《指南》年龄段表现的关系，不形成幼儿总分或一次性达标结论"><div className="development-reference-list">{runs.map((run) => { const references = run.developmentReferences ?? []; return <section key={run.id}><header><div><Badge tone="green">{run.ageReference || "年龄参照待重新生成"}</Badge><strong>{run.knowledgeVersion || "旧版模拟草稿"}</strong></div><Link to="/knowledge">打开完整知识库 <ArrowRight /></Link></header>{references.length ? <div>{references.map((reference) => <article key={reference.indicatorCode}><div><Badge tone={tone(reference.status)}>{reference.status}</Badge><strong>{reference.domain} · {reference.indicatorTitle}</strong><code>{reference.indicatorCode}</code></div><p>{reference.evidenceStatement}</p><small><CircleAlert />还需补充：{reference.missingEvidence}</small></article>)}</div> : <EmptyState title="本草稿尚无年龄参照结果" description="这是旧版模拟分析或证据尚未匹配。可保留原稿，并在新证据包中重新生成。" />}</section>; })}</div></Panel>;
}

export function EvidenceWorkspacePage() {
  const { evidencePackages, observationSubjects, mediaEvidence, analysisRuns, claims, supportActions, selectedPackageId, selectPackage, submitPackage, analyzeVideo, runAnalysis, integratePackage, updateSupport, busy } = useAppStore();
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"teacher" | "media" | "ai" | "response">("teacher");
  const pkg = evidencePackages.find((item) => item.id === selectedPackageId) || evidencePackages[0];
  if (!pkg) return <EmptyState title="还没有证据包" description="从一次真实游戏观察开始。" action={<button className="btn btn-primary" onClick={() => setShowNew(true)}>新建证据包</button>} />;
  const subjects = observationSubjects.filter((item) => item.evidencePackageId === pkg.id);
  const media = mediaEvidence.filter((item) => item.evidencePackageId === pkg.id);
  const runs = analysisRuns.filter((item) => item.evidencePackageId === pkg.id);
  const relatedClaims = claims.filter((claim) => runs.some((run) => run.id === claim.analysisRunId));
  const actions = supportActions.filter((item) => item.sourcePackageId === pkg.id);
  const step = pkg.status === "教师草稿" ? 3 : pkg.status === "教师已提交" ? 4 : pkg.status === "待对照审核" ? 5 : 7;
  return <div className="page evidence-page"><PageHeader eyebrow="EVIDENCE WORKSPACE" title="观察 · 识别 · 应答工作台" description="教师原稿、模拟 AI 对照、审核决定和后续复察在一个证据链中完成。" actions={<button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus />新建证据包</button>} />
    <ProcessRail active={step} />
    <div className="evidence-layout"><Panel className="package-list" title="证据包"><div className="package-filter"><span>{evidencePackages.length} 项</span><button>按时间</button></div>{evidencePackages.map((item) => <button className={item.id === pkg.id ? "selected" : ""} key={item.id} onClick={() => selectPackage(item.id)}><span className="package-scene">{item.scene.slice(0, 1)}</span><div><strong>{item.title}</strong><small>{dateLabel(item.observedAt)} · {item.theme}</small><Badge tone={tone(item.status)}>{item.status}</Badge></div></button>)}</Panel>
      <div className="workspace-main"><Panel><div className="package-header"><div><div className="chip-list"><Badge tone={tone(pkg.status)}>{pkg.status}</Badge><Badge tone="gray">证据{pkg.evidenceSufficiency}</Badge>{pkg.gamePlanId ? <Badge tone="blue">已关联游戏计划</Badge> : <Badge tone="gray">生成性游戏</Badge>}</div><h2>{pkg.title}</h2><p><CalendarDays />{fullDate(pkg.observedAt)}　<Clock3 />{pkg.durationMinutes}分钟　<Activity />{pkg.scene} · {pkg.theme}</p></div><div className="subject-avatars">{subjects.map((subject) => <span key={subject.id} title={`${subject.childName} · ${subject.role}`}>{subject.childName.slice(0, 1)}</span>)}</div></div>
        <div className="workspace-tabs">{[["teacher", "教师原始判断"], ["media", `媒体证据 ${media.length}`], ["ai", `AI 对照 ${runs.length}`], ["response", `应答与复察 ${actions.length}`]].map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key as typeof tab)}>{label}</button>)}</div>
      </Panel>
      {tab === "teacher" && <div className="teacher-evidence-grid">{subjects.map((subject) => <Panel key={subject.id}><div className="subject-title"><div><Badge tone={subject.role === "主要观察" ? "green" : "gray"}>{subject.role}</Badge><h3>{subject.childName}</h3><small>{subject.visualCue}</small></div><ShieldCheck /></div><section className="evidence-layer fact-layer"><span>01 客观观察</span><p>{subject.teacherObservation}</p>{subject.childQuote && <blockquote>“{subject.childQuote}”</blockquote>}</section><section className="evidence-layer interpret-layer"><span>02 教师识别</span><p>{subject.teacherIdentification || "教师尚未填写识别。"}</p></section><section className="evidence-layer response-layer"><span>03 教师应答</span><Badge tone="purple">{subject.teacherResponseDraft.category}</Badge><p>{subject.teacherResponseDraft.strategy || "尚未填写支持策略。"}</p><small>下一次观察：{subject.teacherResponseDraft.nextObservationFocus || "待补充"}</small></section></Panel>)}<Panel className="submission-card"><div><ShieldCheck /><h3>{pkg.status === "教师草稿" ? "确认后提交教师原始判断" : "教师原稿已经提交并留存版本"}</h3><p>{pkg.status === "教师草稿" ? "提交后才会开放模拟 AI。后续 AI 内容不会覆盖这份原稿。" : `提交时间：${pkg.teacherSubmittedAt ? fullDate(pkg.teacherSubmittedAt) : "已记录"}`}</p></div>{pkg.status === "教师草稿" ? <button className="btn btn-primary" disabled={busy} onClick={() => void submitPackage(pkg.id)}>提交并锁定原稿</button> : <Badge tone="green"><CheckCircle2 /> 已留存</Badge>}</Panel></div>}
      {tab === "media" && <div className="media-evidence-list">{media.length ? media.map((item) => <Panel key={item.id}><div className="media-head"><span className="media-icon">{item.type === "视频" ? <Film /> : <Image />}</span><div><Badge tone="gray">{item.type}</Badge><h3>{item.name}</h3><p>{item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB · ` : ""}保存在当前浏览器</p></div>{item.type === "视频" && <Badge tone={item.simulatedAnalysisStatus === "已分析" ? "green" : "orange"}>{item.simulatedAnalysisStatus || "待分析"}</Badge>}</div>{item.type === "视频" && item.simulatedAnalysisStatus !== "已分析" && <div className="simulate-box"><Sparkles /><div><strong>模拟 AI 行为分析</strong><p>将生成事件时间轴与可编辑转写，不做人脸识别，也不直接生成正式发展结论。</p></div><button className="btn btn-primary" onClick={() => void analyzeVideo(item.id)} disabled={busy}><Play />开始分析</button></div>}{item.events && <div className="event-timeline">{item.events.map((event) => <article key={event.id}><span>{String(Math.floor(event.startSecond / 60)).padStart(2, "0")}:{String(event.startSecond % 60).padStart(2, "0")} - {String(Math.floor(event.endSecond / 60)).padStart(2, "0")}:{String(event.endSecond % 60).padStart(2, "0")}</span><div><Badge tone="blue">{event.category}</Badge><strong>{event.objectiveDescription}</strong><p>{event.possibleMeaning}</p></div><small>{Math.round(event.confidence * 100)}%</small></article>)}</div>}{item.transcript && <div className="transcript-box"><MessageSquareText /><div><strong>模拟转写（教师需确认）</strong><p>{item.transcript}</p></div><button className="btn btn-ghost"><PencilLine />编辑</button></div>}</Panel>) : <EmptyState title="没有媒体证据" description="文字白描仍可构成证据；媒体不是必填项。" />}</div>}
      {tab === "ai" && <div>{pkg.status === "教师草稿" ? <Panel><EmptyState title="模拟 AI 尚未开放" description="请先完成并提交教师原始观察、识别与应答。" action={<button className="btn btn-primary" onClick={() => setTab("teacher")}>返回教师原稿</button>} /></Panel> : !runs.length ? <Panel><div className="ai-ready"><BrainCircuit /><div><Badge tone="orange">模拟 AI</Badge><h2>生成第二视角，不替代教师判断</h2><p>系统只使用已提交白描、幼儿原话和媒体事件；输出事实、解释、假设、班级年龄参照及证据缺口。</p></div><button className="btn btn-primary" disabled={busy} onClick={() => void runAnalysis(pkg.id)}><Sparkles />生成对照分析</button></div></Panel> : <><Panel title="教师与模拟 AI 对照"><div className="comparison-grid"><article><span>一致之处</span>{runs[0].comparison.agreement.map((item) => <p key={item}><CheckCircle2 />{item}</p>)}</article><article><span>AI 补充</span>{runs[0].comparison.aiAdditions.map((item) => <p key={item}><Sparkles />{item}</p>)}</article><article><span>教师独有情境</span>{runs[0].comparison.teacherOnly.map((item) => <p key={item}><ShieldCheck />{item}</p>)}</article></div></Panel><DevelopmentReferencePanel runs={runs} /><div className="claims-grid">{relatedClaims.map((claim) => <ClaimCard claim={claim} key={claim.id} />)}</div><Panel className="integration-card"><div><CheckCircle2 /><h3>逐条完成审核后，由教师整合</h3><p>仍有 {relatedClaims.filter((item) => item.reviewStatus === "待审核").length} 条待审核。被拒绝和待验证的内容不会成为正式成长结论。</p></div><button className="btn btn-primary" disabled={pkg.status === "已整合"} onClick={() => void integratePackage(pkg.id)}>{pkg.status === "已整合" ? "已完成整合" : "完成教师整合"}</button></Panel></>}</div>}
      {tab === "response" && <div>{actions.length ? actions.map((action) => <Panel key={action.id}><div className="support-head"><div><Badge tone="purple">{action.category}</Badge><h3>{action.strategy}</h3><p>{action.rationale}</p></div><Badge tone={tone(action.status)}>{action.status}</Badge></div><div className="support-flow"><article><span>准备怎样做</span><p>{action.plannedAction}</p><small>计划：{action.plannedAt}</small></article><ArrowRight /><article><span>幼儿后续反应</span><p>{action.childResponse || "尚待实施或复察，不预填效果。"}</p><small>{action.followUpPackageId ? `已关联 ${action.followUpPackageId}` : "等待后续证据"}</small></article><ArrowRight /><article><span>效果判断</span><p>{action.effect || "证据不足，不能判断"}</p><small>下一观察：{action.nextObservationFocus}</small></article></div><div className="panel-actions"><button className="btn btn-secondary" onClick={() => void updateSupport({ ...action, status: nextSupportStatus[action.status] })}>推进到“{nextSupportStatus[action.status]}”</button></div></Panel>) : <Panel><EmptyState title="还没有正式支持行动" description="教师整合识别后，可把应答草案转为待实施行动，并关联下一次观察。" /></Panel>}</div>}
      </div>
    </div>
    {showNew && <NewEvidenceModal onClose={() => setShowNew(false)} />}
  </div>;
}

export function GrowthPage() {
  const { children, selectedChildId, selectChild, growthStatements, evidencePackages, observationSubjects, supportActions } = useAppStore();
  const child = children.find((item) => item.id === selectedChildId) || children[0];
  if (!child) return null;
  const statements = growthStatements.filter((item) => item.childId === child.id);
  const packageIds = new Set(observationSubjects.filter((item) => item.childId === child.id).map((item) => item.evidencePackageId));
  const packages = evidencePackages.filter((item) => packageIds.has(item.id)).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return <div className="page"><PageHeader eyebrow="INDIVIDUAL GROWTH" title="个体成长轨迹" description="只比较同一幼儿在不同时间、情境与支持条件下的变化，不与同伴比较。" />
    <Panel><div className="child-selector">{children.map((item) => <button className={child.id === item.id ? "selected" : ""} onClick={() => selectChild(item.id)} key={item.id}><Avatar child={item} size="sm" /><span>{item.alias}</span></button>)}</div></Panel>
    <div className="growth-profile"><Panel><div className="profile-head"><Avatar child={child} size="lg" /><div><Badge tone="green">{child.grade}</Badge><h2>{child.alias}的成长证据</h2><p>兴趣：{child.interests.join("、")} · {packages.length} 个关联证据包</p></div></div><div className="level-legend">{["初现", "发展中", "较稳定", "跨情境迁移"].map((item) => <span key={item}><i />{item}</span>)}</div>{statements.length ? statements.map((item) => <article className="growth-statement" key={item.id}><div><Badge tone={item.level === "跨情境迁移" ? "purple" : item.level === "较稳定" ? "green" : "blue"}>{item.level}</Badge><strong>{item.domain} · {item.title}</strong></div><p>{item.statement}</p><small><Link2 /> {item.evidencePackageIds.length} 个证据包 · {item.supportActionIds.length} 项教师支持</small></article>) : <EmptyState title="尚无已整合成长陈述" description="关联观察仍可查看，但需要更多时间点和教师审核后才能形成成长陈述。" />}</Panel>
    <Panel title="证据时间轴" subtitle="事实与支持效果按发生时间排列"><div className="vertical-timeline">{packages.map((pkg) => { const action = supportActions.find((item) => item.sourcePackageId === pkg.id); return <article key={pkg.id}><span>{dateLabel(pkg.observedAt)}</span><i /><div><Badge tone={tone(pkg.status)}>{pkg.status}</Badge><h3>{pkg.title}</h3><p>{pkg.scene} · {pkg.theme}</p>{action && <small><Target />支持：{action.strategy} · {action.status}</small>}</div></article>; })}</div></Panel></div>
  </div>;
}

export function ClassroomPage() {
  const { classReports, children, evidencePackages, observationSubjects, curriculumClues } = useAppStore();
  const report = classReports[0];
  if (!report) return null;
  const domainData = Object.entries(report.domainEvidence).map(([name, value]) => ({ name, value }));
  const childCoverage = children.map((child) => ({ name: child.alias, value: new Set(observationSubjects.filter((item) => item.childId === child.id).map((item) => item.evidencePackageId)).size }));
  return <div className="page"><PageHeader eyebrow="CLASSROOM EVIDENCE PROFILE" title="班级游戏学习画像" description="看观察机会、场景覆盖、共同问题和支持跟进，不生成幼儿能力排名。" />
    <div className="metrics-row"><Metric icon={<Users />} value={`${report.observedChildCount}/${report.totalChildCount}`} label="本周期覆盖幼儿" detail="2名幼儿需补观察" /><Metric icon={<Activity />} value={report.sceneCoverage.length} label="已覆盖游戏场景" detail={report.sceneCoverage.join("、")} tone="blue" /><Metric icon={<Target />} value={`${report.supportFollowUpRate}%`} label="支持行动复察率" detail="目标是形成证据闭环" tone="orange" /><Metric icon={<BookOpen />} value={curriculumClues.filter((item) => item.thresholdMet).length} label="成熟课程线索" detail="至少2个时间点" tone="purple" /></div>
    <div className="dashboard-grid"><Panel title="五大领域证据覆盖" subtitle="百分比仅表示证据覆盖，不表示幼儿能力"><div className="chart-box"><ResponsiveContainer width="100%" height={270}><BarChart data={domainData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Bar dataKey="value" radius={[8, 8, 0, 0]}>{domainData.map((_, index) => <Cell key={index} fill={["#6FA8C7", "#D58DA8", "#E6A77B", "#5E9077", "#8E9ED0"][index]} />)}</Bar></BarChart></ResponsiveContainer></div></Panel><Panel title="观察机会分布" subtitle="用于发现谁长期没有被看见，不用于排序能力"><div className="coverage-list">{childCoverage.map((item) => <div key={item.name}><span>{item.name}</span><ProgressBar value={item.value * 20} /><strong>{item.value}次</strong></div>)}</div></Panel></div>
    <div className="dashboard-grid"><Panel title="持续出现的兴趣"><div className="theme-cloud">{report.commonInterests.map((item, index) => <span style={{ fontSize: `${16 + index * 4}px` }} key={item}>{item}</span>)}</div></Panel><Panel title="班级共同问题"><div className="question-list">{report.recurringQuestions.map((item, index) => <p key={item}><span>0{index + 1}</span>{item}</p>)}</div></Panel></div>
    <Panel title="下一周期专业行动"><div className="suggestion-strip">{report.nextSuggestions.map((item) => <article key={item}><Lightbulb /><span>{item}</span></article>)}</div></Panel>
  </div>;
}

export function ReportsPage() {
  const { individualReports, classReports, requestReportExport, advanceReport, exportRequests } = useAppStore();
  const [type, setType] = useState<"individual" | "class">("individual");
  const [selectedId, setSelectedId] = useState(individualReports[0]?.id);
  const [audience, setAudience] = useState<"teacher" | "family">("teacher");
  const report = individualReports.find((item) => item.id === selectedId) || individualReports[0];
  const classReport = classReports[0];
  return <div className="page"><PageHeader eyebrow="PERIOD REPORT" title="周期报告" description="报告自动汇总已审核证据；教师版保留专业分析，家长版使用可理解、非比较语言。" actions={<button className="btn btn-secondary" onClick={() => window.print()}><Printer />浏览器打印</button>} />
    <div className="segmented report-type"><button className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>个体周期报告</button><button className={type === "class" ? "active" : ""} onClick={() => setType("class")}>班级周期报告</button></div>
    {type === "individual" && report ? <div className="report-layout"><Panel className="report-list" title="报告列表">{individualReports.map((item) => <button className={item.id === report.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} key={item.id}><div><strong>{item.childName}</strong><span>{item.periodLabel}</span></div><Badge tone={tone(item.status)}>{item.status}</Badge></button>)}</Panel><article className="report-paper"><header><div><span>同迹 · {audience === "teacher" ? "教师专业版" : "家庭交流版"}</span><h1>{report.childName}的游戏学习与发展记录</h1><p>{report.periodLabel} · 大一班</p></div><div className="segmented"><button className={audience === "teacher" ? "active" : ""} onClick={() => setAudience("teacher")}>教师版</button><button className={audience === "family" ? "active" : ""} onClick={() => setAudience("family")}>家长版</button></div></header><section className="report-highlight"><Sprout /><div><strong>{audience === "teacher" ? report.observationCoverage : `${report.childName}最近很喜欢${report.interests.join("、")}。`}</strong><p>{audience === "teacher" ? "以下判断只使用教师已经审核并整合的证据。" : "我们关注孩子自己的变化，不与其他孩子比较。"}</p></div></section><div className="report-sections"><section><span>01</span><h2>{audience === "teacher" ? "主要兴趣与已有经验" : "最近喜欢的游戏"}</h2>{report.interests.map((item) => <p key={item}>• {item}</p>)}</section><section><span>02</span><h2>有证据支持的成长</h2>{report.evidencedGrowth.map((item) => <p key={item}>• {item}</p>)}</section><section><span>03</span><h2>{audience === "teacher" ? "教师支持及效果" : "老师怎样支持"}</h2>{report.supportAndEffect.map((item) => <p key={item}>• {item}</p>)}</section><section><span>04</span><h2>{audience === "teacher" ? "待验证问题与下一计划" : "家庭共玩建议"}</h2>{(audience === "teacher" ? [...report.pendingQuestions, ...report.nextPlan] : report.familySuggestions).map((item) => <p key={item}>• {item}</p>)}</section></div><footer><span>证据索引：{report.evidencePackageIds.join(" · ")}</span><Badge tone={tone(report.status)}>{report.status}</Badge></footer><div className="report-actions"><button className="btn btn-secondary" onClick={() => void advanceReport(report)}>推进报告状态</button><button className="btn btn-primary" disabled={exportRequests.some((item) => item.objectId === report.id && item.status === "待审批")} onClick={() => void requestReportExport(report)}><FileCheck2 />申请导出</button></div></article></div> : classReport ? <article className="report-paper class-paper"><header><div><span>班级证据画像</span><h1>{classReport.periodLabel}</h1><p>不展示个体排名与综合分数</p></div><Badge tone={tone(classReport.status)}>{classReport.status}</Badge></header><div className="report-sections"><section><span>01</span><h2>观察覆盖</h2><p>{classReport.observedChildCount}/{classReport.totalChildCount}名幼儿，覆盖{classReport.sceneCoverage.length}类场景。</p></section><section><span>02</span><h2>共同兴趣</h2><p>{classReport.commonInterests.join("、")}</p></section><section><span>03</span><h2>持续问题</h2>{classReport.recurringQuestions.map((item) => <p key={item}>• {item}</p>)}</section><section><span>04</span><h2>下一步建议</h2>{classReport.nextSuggestions.map((item) => <p key={item}>• {item}</p>)}</section></div></article> : null}
  </div>;
}

export function CurriculumPage() {
  const { curriculumClues, curriculumPlans, evidencePackages, advanceCurriculum, scanCurriculum } = useAppStore();
  const [selectedId, setSelectedId] = useState(curriculumClues[0]?.id);
  const clue = curriculumClues.find((item) => item.id === selectedId) || curriculumClues[0];
  const plan = curriculumPlans.find((item) => item.clueId === clue?.id);
  if (!clue) return null;
  return <div className="page">
    <PageHeader eyebrow="EMERGENT CURRICULUM" title="从游戏证据生成课程" description="课程不是固定模板。只有持续兴趣、多个时间点和可继续探究的问题共同出现时，才形成课程线索。" actions={<button className="btn btn-primary" onClick={scanCurriculum}><Sparkles />重新扫描课程线索</button>} />
    <div className="curriculum-threshold"><span><CheckCircle2 />相近兴趣</span><ArrowRight /><span><CheckCircle2 />至少2名幼儿或同一幼儿3次</span><ArrowRight /><span><CheckCircle2 />不少于2个时间点</span><ArrowRight /><span><CheckCircle2 />存在未解决问题</span></div>
    <div className="master-detail">
      <Panel className="master-list" title="课程线索">{curriculumClues.map((item) => <button className={item.id === clue.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} key={item.id}><div><Badge tone={item.thresholdMet ? "green" : "orange"}>{item.thresholdMet ? "达到阈值" : "继续观察"}</Badge><strong>{item.title}</strong><span>{item.childIds.length}名幼儿 · {item.timePointCount}个时间点</span></div><ChevronRight /></button>)}</Panel>
      <div className="detail-stack">
        <Panel><div className="clue-origin"><Layers3 /><div><Badge tone="purple">{clue.status}</Badge><h2>{clue.title}</h2><p>{clue.origin}</p></div></div><div className="evidence-chain"><strong>证据摘要</strong><p>{clue.evidenceSummary}</p><div>{clue.evidencePackageIds.map((id) => { const pkg = evidencePackages.find((item) => item.id === id); return <Link to="/evidence" key={id}><Link2 />{pkg?.title || id}</Link>; })}</div></div></Panel>
        {plan ? <article className="curriculum-paper">
          <header><div><span>生成性课程草案 · V{plan.planVersion}</span><h1>{plan.title}</h1><p>{plan.origin}</p></div><div className="curriculum-status-actions"><Badge tone={tone(plan.status)}>{plan.status}</Badge><button className="btn btn-secondary" onClick={() => void advanceCurriculum(plan)}>保存新版本并推进</button></div></header>
          <div className="curriculum-sections"><section><span>01</span><h2>幼儿已有经验</h2>{plan.existingExperience.map((item) => <p key={item}>• {item}</p>)}</section><section><span>02</span><h2>核心探究问题</h2>{plan.inquiryQuestions.map((item) => <p key={item}>• {item}</p>)}</section><section><span>03</span><h2>关键经验</h2>{plan.keyExperience.map((item) => <Badge tone="blue" key={item}>{item}</Badge>)}</section><section><span>04</span><h2>环境与材料</h2>{plan.environmentAndMaterials.map((item) => <p key={item}>• {item}</p>)}</section></div>
          <section className="pathway"><h2>可能的发展路径</h2><div>{plan.possiblePathways.map((item, index) => <article key={item}><i>{index + 1}</i><strong>{item}</strong>{index < plan.possiblePathways.length - 1 && <ArrowRight />}</article>)}</div></section>
          <footer><Info /><span><strong>动态调整依据：</strong>{plan.adjustmentBasis}</span></footer>
        </article> : <Panel><EmptyState title="证据还不够生成课程草案" description="继续观察该兴趣是否跨时间、跨幼儿出现，并记录尚未解决的问题。" /></Panel>}
      </div>
    </div>
  </div>;
}
