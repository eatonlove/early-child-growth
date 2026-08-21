import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, Ban, BookOpen, Check, CheckCircle2, ChevronRight,
  CircleAlert, Clock3, Download, Eye, FileCheck2, KeyRound, Link2, LockKeyhole,
  MessageSquareText, Microscope, Play, RotateCcw, Search, ShieldCheck,
  Sparkles, Users, X,
} from "lucide-react";
import type { ObservationQualityReview } from "../domain/types";
import { Badge, EmptyState, Metric, PageHeader, Panel, ProgressBar } from "../components/ui";
import { GUIDE_KNOWLEDGE_VERSION, guideKnowledgeStats } from "../data/guideKnowledgeBase";
import { useAppStore } from "../store/useAppStore";

const tone = (status: string): "green" | "orange" | "blue" | "purple" | "gray" | "red" => /通过|启用|完成/.test(status) ? "green" : /待|准备|进行/.test(status) ? "orange" : /拒绝|退回|停用/.test(status) ? "red" : "gray";
const dateLabel = (value: string) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function QualityReviewPage() {
  const { qualityReviews, evidencePackages, observationSubjects, mediaEvidence, saveQualityReview } = useAppStore();
  const [selectedId, setSelectedId] = useState(qualityReviews.find((item) => item.status === "待审核")?.id || qualityReviews[0]?.id);
  const review = qualityReviews.find((item) => item.id === selectedId) || qualityReviews[0];
  const [comment, setComment] = useState(review?.comment || "");
  const pkg = evidencePackages.find((item) => item.id === review?.evidencePackageId);
  const subjects = observationSubjects.filter((item) => item.evidencePackageId === pkg?.id);
  const media = mediaEvidence.filter((item) => item.evidencePackageId === pkg?.id);
  if (!review || !pkg) return <EmptyState title="暂无质量审核任务" description="新的教师观察提交后会进入独立质量审核队列。" />;
  const select = (item: ObservationQualityReview) => { setSelectedId(item.id); setComment(item.comment); };
  const dimensions = [["事实性", review.factuality], ["具体性", review.specificity], ["时序清晰", review.chronology], ["证据匹配", review.evidenceAlignment]] as const;
  return <div className="page"><PageHeader eyebrow="OBSERVATION QUALITY" title="观察质量独立审核" description="这一步只检查教师记录是否客观、具体、可追溯，不审核幼儿能力，也不替代教师发展判断。" />
    <div className="quality-banner"><ShieldCheck /><div><strong>独立于 AI 分析的专业质量关</strong><p>先提升“记录了什么”的可信度，再讨论“可能意味着什么”。退回只针对记录质量，不给教师或幼儿打总分。</p></div></div>
    <div className="metrics-row"><Metric icon={<Clock3 />} value={qualityReviews.filter((item) => item.status === "待审核").length} label="待审核" detail="需查看原始白描与媒体" /><Metric icon={<CheckCircle2 />} value={qualityReviews.filter((item) => item.status === "通过").length} label="已通过" detail="事实和解释边界清楚" tone="blue" /><Metric icon={<CircleAlert />} value={qualityReviews.filter((item) => item.status === "退回修改").length} label="退回修改" detail="教师可补充后重新提交" tone="orange" /></div>
    <div className="master-detail"><Panel className="master-list" title="审核队列">{qualityReviews.map((item) => { const itemPkg = evidencePackages.find((pkgItem) => pkgItem.id === item.evidencePackageId); return <button className={item.id === review.id ? "selected" : ""} onClick={() => select(item)} key={item.id}><div><Badge tone={tone(item.status)}>{item.status}</Badge><strong>{itemPkg?.title}</strong><span>{itemPkg?.scene} · {item.reviewerName}</span></div><ChevronRight /></button>; })}</Panel>
      <div className="detail-stack"><Panel><div className="review-source-head"><div><Badge tone="blue">{pkg.scene}</Badge><h2>{pkg.title}</h2><p>{pkg.theme} · {dateLabel(pkg.observedAt)} · {subjects.length}名观察幼儿 · {media.length}项媒体</p></div><Badge tone={tone(review.status)}>{review.status}</Badge></div>{subjects.map((subject) => <div className="review-original" key={subject.id}><strong>{subject.childName} · {subject.role}</strong><p>{subject.teacherObservation}</p>{subject.childQuote && <blockquote>“{subject.childQuote}”</blockquote>}<div><span>教师识别</span>{subject.teacherIdentification}</div></div>)}</Panel>
      <Panel title="四维质量检查" subtitle="1-5仅用于定位记录质量改进点，不形成绩效总分"><div className="quality-dimensions">{dimensions.map(([name, value]) => <article key={name}><div><strong>{name}</strong><span>{value}/5</span></div><ProgressBar value={value * 20} /></article>)}</div>{review.subjectivePhrases.length > 0 && <div className="phrase-alert"><CircleAlert /><div><strong>发现可能需要改写的主观表述</strong>{review.subjectivePhrases.map((item) => <p key={item}>{item}</p>)}</div></div>}</Panel>
      <Panel title="审核意见"><textarea className="review-comment" rows={5} value={comment} onChange={(event) => setComment(event.target.value)} /><div className="decision-actions"><button className="btn btn-danger" onClick={() => void saveQualityReview(review, "退回修改", comment)}><X />退回修改</button><button className="btn btn-primary" onClick={() => void saveQualityReview(review, "通过", comment)}><Check />审核通过</button></div></Panel></div>
    </div>
  </div>;
}

export function ExportApprovalPage() {
  const { role, exportRequests, decideExport, audits } = useAppStore();
  const [selectedId, setSelectedId] = useState(exportRequests[0]?.id);
  const [note, setNote] = useState("仅限申请用途，导出时使用园内名并隐藏无关幼儿信息。" );
  const request = exportRequests.find((item) => item.id === selectedId) || exportRequests[0];
  if (!request) return null;
  const relatedAudit = audits.filter((item) => item.objectId === request.id);
  const readOnly = role === "principal_viewer";
  return <div className="page"><PageHeader eyebrow="EXPORT APPROVAL" title={readOnly ? "导出审批记录" : "敏感数据导出审批"} description="报告打印、课程案例和匿名研究数据在离开系统前检查用途、接收方、授权与去标识条件。" />
    <div className="metrics-row"><Metric icon={<Clock3 />} value={exportRequests.filter((item) => item.status === "待审批").length} label="待审批" detail="尚不能生成外发文件" /><Metric icon={<CheckCircle2 />} value={exportRequests.filter((item) => item.status === "已通过").length} label="已通过" detail="带审批条件与审计记录" tone="blue" /><Metric icon={<ShieldCheck />} value="100%" label="用途留痕" detail="申请人、接收方和决定完整保存" tone="orange" /></div>
    <div className="master-detail"><Panel className="master-list" title="导出申请">{exportRequests.map((item) => <button className={item.id === request.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} key={item.id}><div><Badge tone={tone(item.status)}>{item.status}</Badge><strong>{item.exportType}</strong><span>{item.applicantName} · {dateLabel(item.createdAt)}</span></div><ChevronRight /></button>)}</Panel><div className="detail-stack"><Panel><div className="approval-title"><div className="approval-icon"><Download /></div><div><Badge tone={tone(request.status)}>{request.status}</Badge><h2>{request.exportType}</h2><p>申请人：{request.applicantName} · 接收方：{request.recipient}</p></div></div><dl className="approval-detail"><div><dt>业务对象</dt><dd>{request.objectId}</dd></div><div><dt>申请用途</dt><dd>{request.purpose}</dd></div><div><dt>接收范围</dt><dd>{request.recipient}</dd></div><div><dt>数据处理</dt><dd>按最小必要原则，仅保留申请对象；课程案例和研究数据默认去标识。</dd></div></dl></Panel>
      {request.status === "待审批" && !readOnly ? <Panel title="审批条件与决定"><textarea className="review-comment" rows={4} value={note} onChange={(event) => setNote(event.target.value)} /><div className="decision-actions"><button className="btn btn-danger" onClick={() => void decideExport(request, "已拒绝", note)}><X />拒绝导出</button><button className="btn btn-primary" onClick={() => void decideExport(request, "已通过", note)}><Check />有条件通过</button></div></Panel> : <Panel title="审批结果"><div className="decision-result"><FileCheck2 /><div><strong>{request.status}</strong><p>{request.decisionNote || "等待教研管理员审批。"}</p><small>{request.decidedBy && `${request.decidedBy} · ${request.decidedAt && dateLabel(request.decidedAt)}`}</small></div></div></Panel>}
      <Panel title="审计轨迹"><div className="audit-mini">{relatedAudit.length ? relatedAudit.map((item) => <p key={item.id}><span>{dateLabel(item.createdAt)}</span><strong>{item.action}</strong><small>{item.detail}</small></p>) : <p><span>{dateLabel(request.createdAt)}</span><strong>提交导出申请</strong><small>{request.purpose}</small></p>}</div></Panel></div></div>
  </div>;
}

export function AccountsPage() {
  const { userAccounts, toggleAccount, audits } = useAppStore();
  const [query, setQuery] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const filtered = userAccounts.filter((item) => item.name.includes(query));
  return <div className="page"><PageHeader eyebrow="ACCOUNT GOVERNANCE" title="账号与停用管理" description="账号停用会立即阻止新的访问，但不删除该账号创建的历史证据、审核与审计记录。" />
    <div className="account-principle"><LockKeyhole /><div><strong>停用不是删除</strong><p>历史专业判断必须继续可追溯。重新启用也会留下新的审计事件。</p></div></div>
    <Panel><div className="toolbar"><label className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索教师、教研员或园长" /></label><Badge tone="gray">{userAccounts.filter((item) => item.status === "启用").length} 个启用账号</Badge></div><div className="account-table"><div className="table-head"><span>账号</span><span>角色</span><span>班级范围</span><span>状态</span><span>操作</span></div>{filtered.map((account) => <article key={account.id}><div className="account-name"><span>{account.name.slice(0, 1)}</span><div><strong>{account.name}</strong><small>{account.id}</small></div></div><span>{account.role === "teacher" ? "教师" : account.role === "research_admin" ? "教研管理员" : "园长查看"}</span><span>{account.classroomIds.length ? "大一班" : "无当前班级"}</span><Badge tone={tone(account.status)}>{account.status}</Badge><div className="account-action">{account.status === "启用" && <input value={reasons[account.id] || ""} onChange={(event) => setReasons({ ...reasons, [account.id]: event.target.value })} placeholder="停用原因" />}<button className={`btn ${account.status === "启用" ? "btn-danger" : "btn-secondary"}`} onClick={() => void toggleAccount(account, reasons[account.id] || "岗位或权限调整")}>{account.status === "启用" ? <><Ban />停用</> : <><RotateCcw />重新启用</>}</button></div></article>)}</div></Panel>
    <Panel title="最近账号审计"><div className="audit-mini">{audits.filter((item) => item.objectType === "UserAccount").map((item) => <p key={item.id}><span>{dateLabel(item.createdAt)}</span><strong>{item.action}</strong><small>{item.detail}</small></p>)}</div></Panel>
  </div>;
}

export function ResearchActivityPage() {
  const { researchActivities, advanceResearch } = useAppStore();
  const activity = researchActivities[0];
  const [focus, setFocus] = useState(activity?.focusOptions[0]);
  if (!activity) return null;
  return <div className="page"><PageHeader eyebrow="COLLABORATIVE INQUIRY" title="教研活动模式" description="以同一段真实视频为共同证据，小组先独立完成观察、识别、应答，再进行差异对照和 AI 辅助总结。" actions={<button className="btn btn-primary" onClick={() => void advanceResearch(activity)}>{activity.status === "准备中" ? <><Play />开始活动</> : activity.status === "进行中" ? <><Check />结束并归档</> : <><RotateCcw />重新演示</>}</button>} />
    <div className="research-hero"><div><Badge tone={tone(activity.status)}>{activity.status}</Badge><h2>{activity.title}</h2><p>{dateLabel(activity.scheduledAt)} · 主持人 {activity.facilitator}</p></div><div className="shared-video"><FilmIcon /><span>共同证据</span><strong>{activity.sharedVideoTitle}</strong></div></div>
    <Panel title="本次教研焦点" subtitle="所有小组观看同一证据，但可选择不同专业观察角度"><div className="focus-pills">{activity.focusOptions.map((item) => <button className={focus === item ? "selected" : ""} onClick={() => setFocus(item)} key={item}>{item}</button>)}</div></Panel>
    <div className="research-groups">{activity.groupSubmissions.map((group) => <Panel key={group.id}><div className="group-head"><span>{group.groupName.slice(0, 2)}</span><div><strong>{group.groupName}</strong><small>{group.focus}</small></div><Badge tone="green">已提交</Badge></div><section><span className="layer fact">观察</span><p>{group.observation}</p></section><section><span className="layer identify">识别</span><p>{group.identification}</p></section><section><span className="layer respond">应答</span><p>{group.response}</p></section></Panel>)}</div>
    <Panel title="模拟 AI 跨组对照" subtitle="只帮助看见差异，不宣布哪一组是唯一正确答案"><div className="ai-comparison"><Sparkles /><div>{activity.aiComparison.map((item) => <p key={item}>{item}</p>)}</div></div></Panel>
    <Panel title="教研活动闭环"><div className="research-process"><span>共同观看</span><ArrowRight /><span>小组独立记录</span><ArrowRight /><span>结构化对照</span><ArrowRight /><span>形成复察问题</span><ArrowRight /><span>回到班级验证</span></div></Panel>
  </div>;
}

function FilmIcon() { return <Activity />; }

export function KnowledgePage() {
  const { knowledgeCards, observationFocuses, gamePlans } = useAppStore();
  const [grade, setGrade] = useState("大班");
  const [domain, setDomain] = useState("全部");
  const [subdomain, setSubdomain] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(knowledgeCards.find((item) => item.grade === "大班")?.id);
  const guideCards = useMemo(() => knowledgeCards.filter((item) => item.kind === "指南年龄参照"), [knowledgeCards]);
  const subdomains = useMemo(() => [...new Set(guideCards.filter((item) => domain === "全部" || item.domain === domain).map((item) => item.subdomain))], [domain, guideCards]);
  const filtered = useMemo(() => knowledgeCards.filter((item) => {
    const gradeMatch = grade === "理论" ? item.grade === "跨年龄" : item.grade === grade;
    const domainMatch = domain === "全部" || item.domain === domain;
    const subdomainMatch = subdomain === "全部" || item.subdomain === subdomain;
    return gradeMatch && domainMatch && subdomainMatch && `${item.code}${item.title}${item.source}${item.keywords.join("")}`.includes(query);
  }), [domain, grade, knowledgeCards, query, subdomain]);
  const card = filtered.find((item) => item.id === selectedId) || filtered[0];
  const ageComparison = card?.kind === "指南年龄参照"
    ? guideCards.filter((item) => item.domain === card.domain && item.subdomain === card.subdomain && item.goalNumber === card.goalNumber)
    : [];
  return <div className="page"><PageHeader eyebrow="KNOWLEDGE & TEMPLATE" title="《指南》分年龄知识库" description="完整覆盖健康、语言、社会、科学、艺术五大领域。先按儿童所在班级选择年龄参照，再用连续证据判断当前表现和后续应答。" />
    <div className="metrics-row knowledge-metrics"><Metric icon={<BookOpen />} value={guideKnowledgeStats.domains} label="领域" detail="健康、语言、社会、科学、艺术" /><Metric icon={<LibraryIcon />} value={guideKnowledgeStats.subdomains} label="子领域" detail="按《指南》原结构组织" tone="blue" /><Metric icon={<TargetIcon />} value={guideKnowledgeStats.goals} label="发展目标" detail="全部目标已建库" tone="orange" /><Metric icon={<DatabaseIcon />} value={guideKnowledgeStats.ageReferenceCards} label="年龄参照卡" detail="32目标 × 3年龄段" tone="purple" /></div>
    <div className="knowledge-boundary"><ShieldCheck /><div><strong>这里不做简单“达标 / 不达标”判决</strong><p>《指南》描述的是各年龄段末期大致可以达到的合理期望。系统输出“已观察到相关表现、部分证据、待继续观察”，稳定判断必须有跨时间、跨情境证据。</p></div><Badge tone="green">{GUIDE_KNOWLEDGE_VERSION}</Badge></div>
    <div className="knowledge-principle"><span>儿童所在班级</span><ArrowRight /><span>原始行为证据</span><ArrowRight /><span>年龄段参照</span><ArrowRight /><span>证据充分性</span><ArrowRight /><span>经验 / 材料 / 活动应答</span><ArrowRight /><span>复察验证</span></div>
    <Panel className="knowledge-filter-panel"><div className="knowledge-filter-row"><strong>年龄参照</strong><div className="focus-pills">{["小班", "中班", "大班", "理论"].map((item) => <button className={grade === item ? "selected" : ""} key={item} onClick={() => { setGrade(item); setSubdomain("全部"); }}>{item}{item === "小班" ? " 3-4岁" : item === "中班" ? " 4-5岁" : item === "大班" ? " 5-6岁" : ""}</button>)}</div></div><div className="knowledge-filter-row"><strong>五大领域</strong><div className="focus-pills">{["全部", "健康", "语言", "社会", "科学", "艺术", "课程"].map((item) => <button className={domain === item ? "selected" : ""} key={item} onClick={() => { setDomain(item); setSubdomain("全部"); }}>{item}</button>)}</div></div>{grade !== "理论" && <div className="knowledge-filter-row"><strong>子领域</strong><div className="focus-pills"><button className={subdomain === "全部" ? "selected" : ""} onClick={() => setSubdomain("全部")}>全部</button>{subdomains.map((item) => <button className={subdomain === item ? "selected" : ""} key={item} onClick={() => setSubdomain(item)}>{item}</button>)}</div></div>}</Panel>
    <div className="knowledge-layout"><Panel className="knowledge-list"><label className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索目标、行为、关键词或编码" /></label><div className="knowledge-list-count">当前显示 {filtered.length} 项</div><div className="knowledge-items">{filtered.map((item) => <button className={card?.id === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} key={item.id}><div><Badge tone={item.kind === "指南年龄参照" ? "blue" : "purple"}>{item.subdomain}</Badge><strong>{item.title}</strong><span>{item.domain} · {item.ageBand} · 目标{item.goalNumber || "原则"}</span><code>{item.code}</code></div><ChevronRight /></button>)}</div></Panel>{card ? <div className="detail-stack"><Panel><div className="knowledge-title"><BookOpen /><div><div className="knowledge-badges"><Badge tone="green">{card.domain} · {card.subdomain}</Badge><Badge tone="blue">{card.grade} · {card.ageBand}</Badge><Badge tone="gray">{card.applicability}</Badge></div><h2>{card.title}</h2><p>{card.source} · {card.sourceVersion}</p><code>{card.code}</code>{card.sourceUrl && <a className="source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">查看教育部正式来源 <ArrowRight /></a>}</div></div></Panel>
      {card.kind === "指南年龄参照" && <Panel title={`${card.grade}年龄段末期合理期望`} subtitle="以下为《指南》来源层；产品转译内容在后续区块单独展示"><div className="official-expectations">{card.officialExpectations.map((item, index) => <article key={item}><span>{index + 1}</span><p>{item}</p></article>)}</div></Panel>}
      {ageComparison.length > 0 && <Panel title="同一目标的小中大班对照" subtitle="用于理解发展进阶，不用于把不同年龄幼儿横向排名"><div className="age-comparison">{ageComparison.map((item) => <article className={item.id === card.id ? "selected" : ""} key={item.id} onClick={() => { setGrade(item.grade); setSelectedId(item.id); }}><header><Badge tone={item.id === card.id ? "green" : "gray"}>{item.grade}</Badge><strong>{item.ageBand}</strong></header>{item.officialExpectations.map((expectation) => <p key={expectation}>{expectation}</p>)}</article>)}</div></Panel>}
      <div className="dashboard-grid"><Panel title="游戏中的可观察行为"><div className="check-lines">{card.observableBehaviors.map((item) => <p key={item}><Eye />{item}</p>)}</div></Panel><Panel title="反例与误判提醒"><div className="warning-card"><CircleAlert />{card.misunderstandingWarning}</div><div className="assessment-lines">{card.assessmentGuidance.map((item) => <p key={item}><CheckCircle2 />{item}</p>)}</div></Panel></div>
      <Panel title="证据最低要求" subtitle="达不到要求时应写“证据不足”，不能写“幼儿不会”"><div className="evidence-requirements">{card.evidenceRequirements.map((item, index) => <article key={item}><span>证据 {index + 1}</span><p>{item}</p></article>)}</div></Panel>
      <Panel title="教师应答设计" subtitle="应答是下一次支持行动，实施后必须再次观察"><div className="response-strategy-grid">{Object.entries(card.responseStrategies).map(([category, items]) => <article key={category}><Badge tone={category === "经验支持" ? "purple" : category === "材料支持" ? "orange" : "blue"}>{category}</Badge>{items.map((item) => <p key={item}>{item}</p>)}</article>)}</div></Panel>
      <Panel title="下一次观察问题"><div className="next-prompts">{card.nextObservationPrompts.map((item) => <p key={item}><Search />{item}</p>)}</div></Panel>
      <div className="dashboard-grid"><Panel title={`观察焦点模板 · ${observationFocuses.length}项`}><div className="mini-links">{observationFocuses.slice(0, 6).map((item) => <span key={item.id}>{item.name} · {item.group}</span>)}</div></Panel><Panel title={`游戏计划模板 · ${gamePlans.length}项`}><div className="mini-links">{gamePlans.map((item) => <span key={item.id}>{item.title} · {item.scene}</span>)}</div></Panel></div></div> : <EmptyState title="没有匹配知识卡" description="调整班级、领域、子领域或搜索关键词。" />}</div>
  </div>;
}

function LibraryIcon() { return <BookOpen />; }
function TargetIcon() { return <Microscope />; }
function DatabaseIcon() { return <Activity />; }
