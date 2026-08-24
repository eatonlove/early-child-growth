import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileVideo,
  KeyRound,
  Layers3,
  Microscope,
  Play,
  Plus,
  RefreshCcw,
  Save,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  LoadingState,
  Metric,
  Modal,
  PageHeader,
  Panel,
} from "../components/ui";
import { useNavigate } from "../router";
import { remoteApi, RemoteApiError } from "./api";
import type {
  RemoteAccount,
  RemoteAnalysis,
  RemoteChild,
  RemoteClassroom,
  RemoteEvidence,
  RemoteKnowledgeCard,
  RemoteObservation,
  RemoteObservationTemplate,
  RemoteQualityQueueItem,
  RemoteExportRequest,
  RemoteResearchActivity,
  RemoteSupportAction,
  RemoteGrowthResult,
  RemotePeriodReport,
  RemoteCurriculumClue,
  RemoteUser,
} from "./types";

const gradeLabel = {
  small: "小班 3-4岁",
  middle: "中班 4-5岁",
  large: "大班 5-6岁",
} as const;
const roleLabel = { teacher: "教师", researcher: "教研员" } as const;
const statusLabel: Record<string, string> = {
  active: "启用",
  disabled: "已停用",
  submitted: "教师已提交",
  ai_ready: "待教师选择",
  adopted: "已采用AI建议",
  abandoned: "已放弃AI建议",
  pending: "待选择",
  passed: "审核通过",
  revision_requested: "退回修改",
  approved: "已批准",
  rejected: "已拒绝",
  preparing: "准备中",
  in_progress: "进行中",
  completed: "已完成",
  archived: "已归档",
  draft: "草稿",
  reviewed: "已审核",
  published: "已发布",
  withdrawn: "已撤回",
  clue: "继续观察",
  reflected: "已复盘",
  planned: "待实施",
  implemented: "已实施",
  follow_up: "待复察",
  verified: "已验证",
  closed: "已关闭",
};
const stageLabel: Record<string, string> = {
  plan: "游戏计划",
  introduction: "游戏导入",
  process: "游戏过程",
  sharing: "游戏分享",
  evaluation: "游戏评价",
};
const responseLabel: Record<string, string> = {
  experience: "经验支持",
  material: "材料支持",
  activity: "活动支持",
};
const tone = (
  status: string,
): "green" | "orange" | "blue" | "gray" | "red" | "purple" =>
  /active|adopted|ready|passed|approved|completed|published|verified|closed/.test(status)
    ? "green"
    : /disabled|abandoned|withdrawn/.test(status)
      ? "red"
      : /pending|submitted|ai_ready/.test(status)
        ? "orange"
        : "gray";
const showError = (error: unknown) =>
  error instanceof RemoteApiError ? error.message : "操作失败，请稍后重试";

export function RemoteDashboardPage({ user }: { user: RemoteUser }) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({
    classrooms: 0,
    children: 0,
    observations: 0,
    pendingAnalyses: 0,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    remoteApi
      .dashboard()
      .then((result) => setCounts(result.counts))
      .catch((reason) => setError(showError(reason)));
  }, []);
  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="TONGJI 3.0 · EVIDENCE WORKSPACE"
        title={`${user.displayName}，从真实观察开始`}
        description={
          user.role === "teacher"
            ? "教师先完成观察、识别和应答，再让AI结合年龄段知识库提供第二视角。"
            : "查看全园班级与观察进展，维护账号和标准化专业底座。"
        }
        actions={
          <button className="btn btn-primary" onClick={() => navigate("/observations")}>
            <Plus />
            {user.role === "teacher" ? "记录新观察" : "查看观察进展"}
          </button>
        }
      />
      {error && (
        <div className="remote-error">
          <CircleAlert />
          {error}
        </div>
      )}
      <div className="remote-hero">
        <div>
          <Badge tone="green">生产数据模式</Badge>
          <h2>一份记录，完成观察、识别、应答与AI对照。</h2>
          <p>
            教师原始内容独立保存。AI结果只有“采用”或“放弃”两种出口，未采用内容不会进入应答与后续追踪。
          </p>
        </div>
        <div className="remote-boundaries">
          <ShieldCheck />
          <strong>专业边界</strong>
          <span>不做幼儿横向排名</span>
          <span>不从单次观察判定达标</span>
          <span>AI结论必须由教师选择</span>
        </div>
      </div>
      <div className="metrics-row">
        <Metric
          icon={<School />}
          value={counts.classrooms}
          label="可访问班级"
          detail="按账号分配范围"
        />
        <Metric
          icon={<Users />}
          value={counts.children}
          label="在册幼儿"
          detail="用于连续追踪"
          tone="blue"
        />
        <Metric
          icon={<Activity />}
          value={counts.observations}
          label="标准观察"
          detail="保留教师原稿"
          tone="orange"
        />
        <Metric
          icon={<BrainCircuit />}
          value={counts.pendingAnalyses}
          label="AI结果待选择"
          detail="采用或放弃"
          tone="purple"
        />
      </div>
      <Panel
        title="标准化核心流程"
        subtitle="应答不是评价结论，而是下一次可实施、可复察的教师行动"
      >
        <div className="remote-flow">
          <span>选择班级与幼儿</span>
          <ArrowRight />
          <span>教师观察</span>
          <ArrowRight />
          <span>教师识别</span>
          <ArrowRight />
          <span>教师应答</span>
          <ArrowRight />
          <span>AI知识对照</span>
          <ArrowRight />
          <span>采用 / 放弃</span>
        </div>
      </Panel>
    </div>
  );
}

export function RemoteClassroomPage({ user }: { user: RemoteUser }) {
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [children, setChildren] = useState<RemoteChild[]>([]);
  const [selected, setSelected] = useState("");
  const [modal, setModal] = useState<"class" | "child" | null>(null);
  const [editingClassId, setEditingClassId] = useState("");
  const [editingChildId, setEditingChildId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [classForm, setClassForm] = useState({
    name: "",
    grade: "middle",
    academicYear: "2026-2027",
    semester: "上学期",
  });
  const [childForm, setChildForm] = useState({
    internalCode: "",
    displayName: "",
    birthMonth: "2022-01",
    guardianConsentStatus: "pending",
    interests: "",
  });

  const load = async () => {
    const [classResult, childResult] = await Promise.all([
      remoteApi.classrooms(),
      remoteApi.children(),
    ]);
    const activeClasses = classResult.items.filter(
      (item) => item.status === "active",
    );
    setClassrooms(activeClasses);
    setChildren(childResult.items);
    setSelected((current) =>
      activeClasses.some((item) => item.id === current)
        ? current
        : activeClasses[0]?.id || "",
    );
  };
  useEffect(() => {
    load().catch((reason) => setError(showError(reason)));
  }, []);
  const selectedClass = classrooms.find((item) => item.id === selected);
  const visibleChildren = children.filter(
    (item) => item.classroom_id === selected && item.status === "active",
  );

  const createClass = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingClassId)
        await remoteApi.updateClassroom(editingClassId, classForm);
      else await remoteApi.createClassroom(classForm);
      setModal(null);
      setEditingClassId("");
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const createChild = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        classroomId: selected,
        internalCode: childForm.internalCode,
        displayName: childForm.displayName,
        birthMonth: `${childForm.birthMonth}-01`,
        guardianConsentStatus: childForm.guardianConsentStatus,
        interests: childForm.interests
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
      if (editingChildId)
        await remoteApi.updateChild(editingChildId, payload);
      else await remoteApi.createChild(payload);
      setModal(null);
      setEditingChildId("");
      setChildForm({
        internalCode: "",
        displayName: "",
        birthMonth: "2022-01",
        guardianConsentStatus: "pending",
        interests: "",
      });
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };

  const editClass = () => {
    if (!selectedClass) return;
    setEditingClassId(selectedClass.id);
    setClassForm({
      name: selectedClass.name,
      grade: selectedClass.grade,
      academicYear: selectedClass.academic_year,
      semester: selectedClass.semester,
    });
    setModal("class");
  };
  const archiveClass = async () => {
    if (
      !selectedClass ||
      !window.confirm(`归档“${selectedClass.name}”？历史观察将继续保留。`)
    )
      return;
    setBusy(true);
    try {
      await remoteApi.updateClassroom(selectedClass.id, {
        status: "archived",
      });
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const editChild = (child: RemoteChild) => {
    setEditingChildId(child.id);
    setChildForm({
      internalCode: child.internal_code,
      displayName: child.display_name,
      birthMonth: child.birth_month.slice(0, 7),
      guardianConsentStatus: child.guardian_consent_status,
      interests: child.interests.join("，"),
    });
    setModal("child");
  };
  const archiveChild = async (child: RemoteChild) => {
    if (!window.confirm(`归档“${child.display_name}”？历史观察将继续保留。`))
      return;
    setBusy(true);
    try {
      await remoteApi.updateChild(child.id, { status: "archived" });
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="CLASSROOM & CHILDREN"
        title="班级与幼儿管理"
        description={
          user.role === "researcher"
            ? "教研员创建班级并分配教师；教师可维护自己负责班级的幼儿档案。"
            : "只显示您被分配的班级；幼儿档案变更不会改变历史观察归属。"
        }
        actions={
          <div className="page-action-row">
            {user.role === "researcher" && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingClassId("");
                  setClassForm({
                    name: "",
                    grade: "middle",
                    academicYear: "2026-2027",
                    semester: "上学期",
                  });
                  setModal("class");
                }}
              >
                <Plus />
                新建班级
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={!selected}
              onClick={() => {
                setEditingChildId("");
                setChildForm({
                  internalCode: "",
                  displayName: "",
                  birthMonth: "2022-01",
                  guardianConsentStatus: "pending",
                  interests: "",
                });
                setModal("child");
              }}
            >
              <UserPlus />
              新增幼儿
            </button>
          </div>
        }
      />
      {error && (
        <div className="remote-error">
          <CircleAlert />
          {error}
        </div>
      )}
      <div className="remote-master-detail">
        <Panel
          className="remote-class-list"
          title={`班级 · ${classrooms.length}`}
        >
          {classrooms.map((item) => (
            <button
              key={item.id}
              className={selected === item.id ? "selected" : ""}
              onClick={() => setSelected(item.id)}
            >
              <span>{item.name.slice(0, 1)}</span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {gradeLabel[item.grade]} · {item.academic_year}{" "}
                  {item.semester}
                </small>
              </div>
              <ChevronRight />
            </button>
          ))}
        </Panel>
        {selectedClass ? (
          <div className="detail-stack">
            <Panel>
              <div className="remote-class-head">
                <div>
                  <Badge tone="green">{gradeLabel[selectedClass.grade]}</Badge>
                  <h2>{selectedClass.name}</h2>
                  <p>
                    {selectedClass.academic_year} · {selectedClass.semester}
                  </p>
                </div>
                <strong>
                  {visibleChildren.length}
                  <small>名在册幼儿</small>
                </strong>
                {user.role === "researcher" && (
                  <div className="remote-row-actions">
                    <button className="btn btn-secondary" onClick={editClass}>
                      编辑班级
                    </button>
                    <button
                      className="btn btn-ghost-danger"
                      disabled={busy}
                      onClick={() => void archiveClass()}
                    >
                      归档
                    </button>
                  </div>
                )}
              </div>
            </Panel>
            <Panel
              title="幼儿档案"
              subtitle="页面默认使用园内名；授权撤回后不能新增媒体证据"
            >
              <div className="remote-child-grid">
                {visibleChildren.map((child) => (
                  <article key={child.id}>
                    <span>{child.display_name.slice(0, 1)}</span>
                    <div>
                      <strong>{child.display_name}</strong>
                      <small>
                        {child.internal_code} · 出生年月{" "}
                        {child.birth_month.slice(0, 7)}
                      </small>
                      <p>
                        {child.interests.length
                          ? child.interests.join(" · ")
                          : "兴趣待持续观察"}
                      </p>
                    </div>
                    <Badge
                      tone={
                        child.guardian_consent_status === "granted"
                          ? "green"
                          : child.guardian_consent_status === "withdrawn"
                            ? "red"
                            : "orange"
                      }
                    >
                      {child.guardian_consent_status === "granted"
                        ? "已授权"
                        : child.guardian_consent_status === "partial"
                          ? "部分授权"
                          : child.guardian_consent_status === "withdrawn"
                            ? "已撤回"
                            : "待确认"}
                    </Badge>
                    <div className="remote-row-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => editChild(child)}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn-ghost-danger"
                        disabled={busy}
                        onClick={() => void archiveChild(child)}
                      >
                        归档
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!visibleChildren.length && (
                <EmptyState
                  title="班级中还没有幼儿"
                  description="新增幼儿后即可创建连续观察记录。"
                />
              )}
            </Panel>
          </div>
        ) : (
          <EmptyState
            title="还没有可访问班级"
            description={
              user.role === "researcher"
                ? "先创建首个班级。"
                : "请联系教研员分配班级。"
            }
          />
        )}
      </div>
      {modal === "class" && (
        <Modal
          title={editingClassId ? "编辑班级" : "新建班级"}
          description="班级由教研员统一建立，避免同一学期重复。"
          onClose={() => setModal(null)}
        >
          <form className="remote-form" onSubmit={createClass}>
            <label>
              <span>班级名称</span>
              <input
                required
                value={classForm.name}
                onChange={(event) =>
                  setClassForm({ ...classForm, name: event.target.value })
                }
              />
            </label>
            <label>
              <span>年龄班</span>
              <select
                value={classForm.grade}
                onChange={(event) =>
                  setClassForm({ ...classForm, grade: event.target.value })
                }
              >
                <option value="small">小班</option>
                <option value="middle">中班</option>
                <option value="large">大班</option>
              </select>
            </label>
            <label>
              <span>学年度</span>
              <input
                required
                value={classForm.academicYear}
                onChange={(event) =>
                  setClassForm({
                    ...classForm,
                    academicYear: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>学期</span>
              <input
                required
                value={classForm.semester}
                onChange={(event) =>
                  setClassForm({ ...classForm, semester: event.target.value })
                }
              />
            </label>
            <button disabled={busy} className="btn btn-primary" type="submit">
              <Save />
              保存班级
            </button>
          </form>
        </Modal>
      )}
      {modal === "child" && (
        <Modal
          title={`${editingChildId ? "编辑幼儿" : "新增幼儿"} · ${selectedClass?.name ?? ""}`}
          description="只录入园内编号、显示名和开展观察所需的最少信息。"
          onClose={() => setModal(null)}
        >
          <form className="remote-form" onSubmit={createChild}>
            <label>
              <span>园内编号</span>
              <input
                required
                value={childForm.internalCode}
                onChange={(event) =>
                  setChildForm({
                    ...childForm,
                    internalCode: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>园内使用名</span>
              <input
                required
                value={childForm.displayName}
                onChange={(event) =>
                  setChildForm({
                    ...childForm,
                    displayName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>出生年月</span>
              <input
                type="month"
                required
                value={childForm.birthMonth}
                onChange={(event) =>
                  setChildForm({ ...childForm, birthMonth: event.target.value })
                }
              />
            </label>
            <label>
              <span>监护人授权</span>
              <select
                value={childForm.guardianConsentStatus}
                onChange={(event) =>
                  setChildForm({
                    ...childForm,
                    guardianConsentStatus: event.target.value,
                  })
                }
              >
                <option value="pending">待确认</option>
                <option value="granted">已授权</option>
                <option value="partial">部分授权</option>
                <option value="withdrawn">已撤回</option>
              </select>
            </label>
            <label>
              <span>已知兴趣（逗号分隔）</span>
              <input
                value={childForm.interests}
                onChange={(event) =>
                  setChildForm({ ...childForm, interests: event.target.value })
                }
              />
            </label>
            <button disabled={busy} className="btn btn-primary" type="submit">
              <Save />
              保存幼儿
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

const emptyObservation = {
  classroomId: "",
  childId: "",
  templateId: "",
  title: "",
  occurredAt: new Date().toISOString().slice(0, 16),
  durationMinutes: 20,
  scene: "建构区",
  theme: "",
  organizationStage: "process",
  observationFocus: "材料选择与使用",
  teacherObservation: "",
  childQuote: "",
  teacherIdentification: "",
  responseCategory: "experience",
  responseStrategy: "",
  nextObservationFocus: "",
};

export function RemoteObservationPage() {
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [children, setChildren] = useState<RemoteChild[]>([]);
  const [observations, setObservations] = useState<RemoteObservation[]>([]);
  const [templates, setTemplates] = useState<RemoteObservationTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<{
    item: RemoteObservation;
    evidence: RemoteEvidence[];
    analyses: RemoteAnalysis[];
  } | null>(null);
  const [form, setForm] = useState({ ...emptyObservation });
  const [files, setFiles] = useState<File[]>([]);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const load = async () => {
    const [classResult, childResult, observationResult] =
      await Promise.all([
        remoteApi.classrooms(),
        remoteApi.children(),
        remoteApi.observations(),
      ]);
    setClassrooms(classResult.items);
    setChildren(childResult.items);
    setObservations(observationResult.items);
    setSelected((current) => current || observationResult.items[0]?.id || "");
    setForm((current) => ({
      ...current,
      classroomId: current.classroomId || classResult.items[0]?.id || "",
    }));
  };
  useEffect(() => {
    load()
      .catch((reason) => setError(showError(reason)))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (selected) {
      setDetail(null);
      setDetailLoading(true);
      remoteApi
        .observation(selected)
        .then(setDetail)
        .catch((reason) => setError(showError(reason)))
        .finally(() => setDetailLoading(false));
    } else {
      setDetail(null);
      setDetailLoading(false);
    }
  }, [selected]);
  useEffect(() => {
    const first = children.find(
      (child) =>
        child.classroom_id === form.classroomId && child.status === "active",
    );
    setForm((current) => ({ ...current, childId: first?.id || "" }));
  }, [form.classroomId, children]);
  useEffect(() => {
    let cancelled = false;
    const grade = classrooms.find((item) => item.id === form.classroomId)?.grade;
    remoteApi
      .templates({ grade, scene: form.scene })
      .then((result) => {
        if (cancelled) return;
        setTemplates(result.items);
        setForm((current) =>
          current.templateId && !result.items.some((item) => item.id === current.templateId)
            ? { ...current, templateId: "" }
            : current,
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(showError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [classrooms, form.classroomId, form.scene]);
  const childMap = useMemo(
    () => new Map(children.map((child) => [child.id, child])),
    [children],
  );
  const classMap = useMemo(
    () => new Map(classrooms.map((item) => [item.id, item])),
    [classrooms],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await remoteApi.createObservation({
        classroomId: form.classroomId,
        childId: form.childId,
        templateId: form.templateId || undefined,
        title: form.title,
        occurredAt: new Date(form.occurredAt).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        scene: form.scene,
        theme: form.theme,
        organizationStage: form.organizationStage,
        observationFocus: form.observationFocus
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        teacherObservation: form.teacherObservation,
        childQuote: form.childQuote,
        teacherIdentification: form.teacherIdentification,
        teacherResponse: {
          category: form.responseCategory,
          strategy: form.responseStrategy,
          nextObservationFocus: form.nextObservationFocus,
        },
      });
      for (const file of files)
        await remoteApi.uploadEvidence(created.item.id, file);
      setModal(false);
      setFiles([]);
      setForm({ ...emptyObservation, classroomId: form.classroomId });
      await load();
      setSelected(created.item.id);
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const runAnalysis = async () => {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await remoteApi.analyze(detail.item.id);
      setDetail(await remoteApi.observation(detail.item.id));
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const openEvidence = async (evidence: RemoteEvidence) => {
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    setBusy(true);
    setError("");
    try {
      const result = await remoteApi.evidenceDownload(evidence.id);
      if (preview) preview.location.href = result.url;
      else window.location.assign(result.url);
    } catch (reason) {
      preview?.close();
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const decide = async (
    analysis: RemoteAnalysis,
    decision: "adopted" | "abandoned",
  ) => {
    setBusy(true);
    setError("");
    try {
      await remoteApi.decideAnalysis(analysis.id, decision, decisionNote);
      setDetail(await remoteApi.observation(analysis.observation_id));
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const latest = detail?.analyses[0];
  const canRunAnalysis = !latest || latest.decision === "abandoned";

  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="OBSERVE · IDENTIFY · RESPOND"
        title="标准化游戏观察"
        description="老师先录入观察、识别和应答。AI结合幼儿所在年龄班与知识库提供结构化建议，老师选择采用或放弃。"
        actions={
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus />
            新建观察
          </button>
        }
      />
      {error && (
        <div className="remote-error">
          <CircleAlert />
          {error}
        </div>
      )}
      <div className="remote-principle">
        <Database />
        <div>
          <strong>教师原稿是默认分析输入</strong>
          <p>
            AI不会覆盖教师的观察、识别和应答。千问模式可在明确授权后分析图片和视频画面；视频音轨不处理，PDF与未授权媒体不发送。
          </p>
        </div>
      </div>
      <div className="remote-observation-layout">
        <Panel className="remote-observation-list">
          <div className="remote-list-head">
            <strong>观察记录</strong>
            <span>{observations.length}条</span>
          </div>
          {observations.map((item) => (
            <button
              className={selected === item.id ? "selected" : ""}
              key={item.id}
              onClick={() => setSelected(item.id)}
            >
              <span>{item.scene.slice(0, 1)}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {childMap.get(item.child_id)?.display_name ?? "幼儿"} ·{" "}
                  {new Date(item.occurred_at).toLocaleDateString("zh-CN")}
                </small>
                <Badge tone={tone(item.status)}>
                  {statusLabel[item.status] ?? item.status}
                </Badge>
              </div>
            </button>
          ))}
        </Panel>
        {detail ? (
          <div className="detail-stack">
            <Panel>
              <div className="remote-detail-head">
                <div>
                  <div className="knowledge-badges">
                    <Badge tone="green">{detail.item.scene}</Badge>
                    <Badge tone="blue">
                      {stageLabel[detail.item.organization_stage]}
                    </Badge>
                    <Badge tone={tone(detail.item.status)}>
                      {statusLabel[detail.item.status]}
                    </Badge>
                  </div>
                  <h2>{detail.item.title}</h2>
                  <p>
                    {classMap.get(detail.item.classroom_id)?.name} ·{" "}
                    {childMap.get(detail.item.child_id)?.display_name} ·{" "}
                    {detail.item.theme}
                  </p>
                </div>
                <div className="remote-evidence-count">
                  <FileVideo />
                  <strong>
                    {
                      detail.evidence.filter(
                        (item) => item.upload_status === "ready",
                      ).length
                    }
                  </strong>
                  <span>项媒体证据</span>
                </div>
              </div>
            </Panel>
            <div className="remote-three-layers">
              <Panel>
                <span className="layer layer-fact">观察</span>
                <p>{detail.item.teacher_observation}</p>
                {detail.item.child_quote && (
                  <blockquote>“{detail.item.child_quote}”</blockquote>
                )}
              </Panel>
              <Panel>
                <span className="layer layer-interpret">识别</span>
                <p>{detail.item.teacher_identification}</p>
              </Panel>
              <Panel>
                <span className="layer layer-response">应答</span>
                <strong>
                  {responseLabel[detail.item.teacher_response.category]}
                </strong>
                <p>{detail.item.teacher_response.strategy}</p>
                <small>
                  复察：{detail.item.teacher_response.nextObservationFocus}
                </small>
              </Panel>
            </div>
            {detail.evidence.length > 0 && (
              <Panel title="观察证据" subtitle="仅就绪证据可通过5分钟有效的私有链接查看">
                <div className="remote-file-list">
                  {detail.evidence.map((item) => (
                    <button
                      className="btn btn-secondary"
                      disabled={busy || item.upload_status !== "ready"}
                      key={item.id}
                      onClick={() => void openEvidence(item)}
                    >
                      <FileVideo />
                      {item.file_name || "未命名证据"}
                      <small>{item.upload_status === "ready" ? "查看" : "处理中"}</small>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
            {canRunAnalysis && (
              <Panel className="remote-ai-launch">
                <Sparkles />
                <div>
                  <Badge tone="purple">AI 循证分析</Badge>
                  <h2>
                    {latest
                      ? "重新运行AI分析"
                      : "让AI结合年龄段知识库提供第二视角"}
                  </h2>
                  <p>
                    {latest
                      ? "已放弃的建议稿会保留在审计记录中；重新运行将生成一份新的待审核结果。"
                      : "系统优先使用已配置的千问模型；结果会明确显示实际模型。未启用或调用失败时，只生成可识别的模拟规则草稿。"}
                  </p>
                </div>
                <button
                  disabled={busy}
                  className="btn btn-primary"
                  onClick={runAnalysis}
                >
                  <BrainCircuit />
                  {latest ? "重新运行分析" : "运行分析"}
                </button>
              </Panel>
            )}
            {latest && (
              <AnalysisPanel
                analysis={latest}
                note={decisionNote}
                setNote={setDecisionNote}
                busy={busy}
                onDecide={decide}
              />
            )}
          </div>
        ) : !loaded || detailLoading ? (
          <LoadingState label="正在加载观察证据…" />
        ) : (
          <EmptyState
            title="还没有观察记录"
            description="新建第一条标准观察，完成教师原稿后再运行AI。"
          />
        )}
      </div>
      {modal && (
        <Modal
          wide
          title="新建标准观察"
          description="观察写事实，识别写专业解释，应答写下一次可执行支持。"
          onClose={() => setModal(false)}
        >
          <form className="remote-observation-form" onSubmit={submit}>
            <div className="remote-form-section">
              <span>01 情境与对象</span>
              <div className="remote-form-grid">
                <label>
                  <b>班级</b>
                  <select
                    required
                    value={form.classroomId}
                    onChange={(event) =>
                      setForm({ ...form, classroomId: event.target.value })
                    }
                  >
                    {classrooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {gradeLabel[item.grade]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <b>主要观察幼儿</b>
                  <select
                    required
                    value={form.childId}
                    onChange={(event) =>
                      setForm({ ...form, childId: event.target.value })
                    }
                  >
                    {children
                      .filter(
                        (child) =>
                          child.classroom_id === form.classroomId &&
                          child.status === "active",
                      )
                      .map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.display_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <b>记录标题</b>
                  <input
                    required
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  <b>发生时间</b>
                  <input
                    type="datetime-local"
                    required
                    value={form.occurredAt}
                    onChange={(event) =>
                      setForm({ ...form, occurredAt: event.target.value })
                    }
                  />
                </label>
                <label>
                  <b>游戏场地</b>
                  <input
                    required
                    value={form.scene}
                    onChange={(event) =>
                      setForm({ ...form, scene: event.target.value })
                    }
                  />
                </label>
                <label>
                  <b>游戏主题</b>
                  <input
                    required
                    value={form.theme}
                    onChange={(event) =>
                      setForm({ ...form, theme: event.target.value })
                    }
                  />
                </label>
                <label>
                  <b>组织阶段</b>
                  <select
                    value={form.organizationStage}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        organizationStage: event.target.value,
                      })
                    }
                  >
                    {Object.entries(stageLabel).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <b>标准观察模板</b>
                  <select
                    value={form.templateId}
                    onChange={(event) => {
                      const template = templates.find(
                        (item) => item.id === event.target.value,
                      );
                      setForm({
                        ...form,
                        templateId: event.target.value,
                        observationFocus:
                          template?.focus_options.join("，") ||
                          form.observationFocus,
                      });
                    }}
                  >
                    <option value="">通用观察表</option>
                    {templates.map((template, index) => (
                      <option key={template.id} value={template.id}>
                        {index === 0 ? "推荐 · " : ""}{template.name} · v{template.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <b>观察重点（逗号分隔）</b>
                  <input
                    value={form.observationFocus}
                    onChange={(event) =>
                      setForm({ ...form, observationFocus: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="remote-form-section">
              <span>02 教师观察</span>
              <label>
                <b>客观白描</b>
                <small>
                  写清幼儿做了什么、说了什么、材料与同伴怎样变化，不写“很聪明”等标签。
                </small>
                <textarea
                  required
                  rows={6}
                  minLength={10}
                  value={form.teacherObservation}
                  onChange={(event) =>
                    setForm({ ...form, teacherObservation: event.target.value })
                  }
                />
              </label>
              <label>
                <b>幼儿原话（可选）</b>
                <textarea
                  rows={2}
                  value={form.childQuote}
                  onChange={(event) =>
                    setForm({ ...form, childQuote: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="remote-form-section">
              <span>03 教师识别</span>
              <label>
                <b>基于上述证据，幼儿当前可能具备什么经验、兴趣或困难？</b>
                <textarea
                  required
                  rows={4}
                  minLength={5}
                  value={form.teacherIdentification}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      teacherIdentification: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="remote-form-section">
              <span>04 教师应答</span>
              <div className="remote-form-grid">
                <label>
                  <b>应答类型</b>
                  <select
                    value={form.responseCategory}
                    onChange={(event) =>
                      setForm({ ...form, responseCategory: event.target.value })
                    }
                  >
                    <option value="experience">经验支持</option>
                    <option value="material">材料支持</option>
                    <option value="activity">活动支持</option>
                  </select>
                </label>
                <label>
                  <b>持续时间（分钟）</b>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={form.durationMinutes}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                <b>下一次准备怎样支持？</b>
                <textarea
                  required
                  rows={3}
                  value={form.responseStrategy}
                  onChange={(event) =>
                    setForm({ ...form, responseStrategy: event.target.value })
                  }
                />
              </label>
              <label>
                <b>支持后重点观察什么？</b>
                <textarea
                  required
                  rows={2}
                  value={form.nextObservationFocus}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      nextObservationFocus: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="remote-form-section">
              <span>05 补充证据</span>
              <label className="remote-upload">
                <Upload />
                <strong>选择照片、视频关键片段或PDF</strong>
                <small>图片/PDF≤10MB，视频≤100MB，最多5项</small>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []).slice(0, 5))
                  }
                />
              </label>
              {files.length > 0 && (
                <div className="remote-file-list">
                  {files.map((file) => (
                    <span key={file.name}>
                      {file.name}
                      <small>{(file.size / 1024 / 1024).toFixed(1)}MB</small>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="remote-submit">
              <p>
                <ShieldCheck />
                提交后教师原稿独立保存，AI只能生成新的建议稿。
              </p>
              <button
                disabled={busy || !form.childId}
                className="btn btn-primary"
                type="submit"
              >
                <Save />
                {busy ? "正在提交…" : "提交观察"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AnalysisPanel({
  analysis,
  note,
  setNote,
  busy,
  onDecide,
}: {
  analysis: RemoteAnalysis;
  note: string;
  setNote(value: string): void;
  busy: boolean;
  onDecide(analysis: RemoteAnalysis, decision: "adopted" | "abandoned"): void;
}) {
  const result = analysis.structured_result;
  const isQianwen = analysis.provider === "QianwenAIProvider";
  return (
    <div className="detail-stack">
      <Panel>
        <div className="remote-analysis-head">
          <div>
            <Badge tone="purple">{isQianwen ? "千问AI建议稿" : "模拟AI建议稿"}</Badge>
            <h2>结构化循证分析</h2>
            <p>
              {analysis.model} · 知识版本 {analysis.knowledge_version} · 证据充分性：
              {result.evidenceSufficiency}
            </p>
          </div>
          <Badge tone={tone(analysis.decision)}>
            {statusLabel[analysis.decision] ?? analysis.decision}
          </Badge>
        </div>
      </Panel>
      <div className="remote-analysis-layers">
        <Panel title="事实层">
          {result.facts.map((item) => (
            <article key={item.content}>
              <CheckCircle2 />
              <div>
                <p>{item.content}</p>
                <small>
                  {item.evidence} · 证据锚点 {item.evidenceIds?.join("、") || "教师原稿"} · 置信度 {Math.round(item.confidence * 100)}%
                </small>
              </div>
            </article>
          ))}
        </Panel>
        <Panel title="解释层">
          {result.interpretations.map((item) => (
            <article key={item.content}>
              <Layers3 />
              <div>
                <p>{item.content}</p>
                <small>{item.indicatorCode} · {item.limitation || "需持续观察验证"}</small>
              </div>
            </article>
          ))}
        </Panel>
        <Panel title="待验证假设">
          {result.hypotheses.map((item) => (
            <article key={item.content}>
              <Search />
              <div>
                <p>{item.content}</p>
                <small>{item.nextObservation || "下一轮观察验证"} · 置信度 {Math.round(item.confidence * 100)}%</small>
              </div>
            </article>
          ))}
        </Panel>
      </div>
      <Panel title="当前经验与教师判断对照" subtitle="教师原判断原样保留，AI只提供补充视角">
        <div className="remote-three-layers">
          <article>
            <span className="layer layer-fact">当前经验</span>
            <p>{result.currentExperience}</p>
          </article>
          <article>
            <span className="layer layer-interpret">教师识别</span>
            <p>{result.teacherComparison.teacherIdentification}</p>
          </article>
          <article>
            <span className="layer layer-response">AI补充</span>
            <p>{result.teacherComparison.aiAddition}</p>
          </article>
        </div>
        <div className="focus-pills compact">
          {result.interestsAndStrengths.map((item) => <span className="selected" key={item}>{item}</span>)}
        </div>
      </Panel>
      <Panel
        title="年龄段知识依据"
        subtitle="显示关联，不据此给幼儿贴“达标/不达标”标签"
      >
        <div className="remote-reference-grid">
          {result.developmentReferences.map((item) => (
            <article key={item.indicatorCode}>
              <div>
                <Badge tone="blue">
                  {item.domain} · {item.ageBand}
                </Badge>
                <code>{item.indicatorCode}</code>
              </div>
              <strong>{item.title}</strong>
              <p>{item.evidenceStatement}</p>
              <small>仍需：{item.missingEvidence}</small>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="可选择的后续应答">
        <div className="remote-response-grid">
          {Object.entries(result.responseSuggestions).map(
            ([category, items]) => (
              <article key={category}>
                <Badge
                  tone={
                    category === "experience"
                      ? "purple"
                      : category === "material"
                        ? "orange"
                        : "blue"
                  }
                >
                  {responseLabel[category]}
                </Badge>
                {items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </article>
            ),
          )}
        </div>
      </Panel>
      <Panel title="证据缺口与下一次观察">
        <div className="remote-response-grid">
          <article><Badge tone="orange">证据缺口</Badge>{result.evidenceGaps.map((item) => <p key={item}>{item}</p>)}</article>
          <article><Badge tone="blue">复察重点</Badge>{result.nextObservation.map((item) => <p key={item}>{item}</p>)}</article>
        </div>
      </Panel>
      <Panel>
        <div className="remote-warning">
          <CircleAlert />
          <div>
            {result.warnings.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
        {analysis.decision === "pending" ? (
          <div className="remote-decision">
            <label>
              <span>教师处理说明（可选）</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="记录采用理由，或说明为什么放弃该建议稿"
              />
            </label>
            <div>
              <button
                disabled={busy}
                className="btn btn-ghost-danger"
                onClick={() => onDecide(analysis, "abandoned")}
              >
                <X />
                放弃AI结果
              </button>
              <button
                disabled={busy}
                className="btn btn-primary"
                onClick={() => onDecide(analysis, "adopted")}
              >
                <Check />
                采用AI结果
              </button>
            </div>
          </div>
        ) : (
          <div className="remote-decision-result">
            <ShieldCheck />
            <strong>
              {analysis.decision === "adopted"
                ? "教师已采用该AI建议稿"
                : "教师已放弃该AI建议稿"}
            </strong>
            <span>{analysis.decision_note || "未填写处理说明"}</span>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function RemoteKnowledgePage() {
  const [cards, setCards] = useState<RemoteKnowledgeCard[]>([]);
  const [grade, setGrade] = useState("middle");
  const [domain, setDomain] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    remoteApi
      .knowledge()
      .then((result) => {
        setCards(result.items);
        setSelected(
          result.items.find((item) => item.grade === "middle")?.id || "",
        );
      })
      .catch((reason) => setError(showError(reason)));
  }, []);
  const filtered = cards.filter(
    (card) =>
      card.grade === grade &&
      (domain === "全部" || card.domain === domain) &&
      `${card.code}${card.title}${card.subdomain}`.includes(query),
  );
  const card = filtered.find((item) => item.id === selected) || filtered[0];
  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title="《3-6岁儿童学习与发展指南》知识库"
        description="按小、中、大班提供年龄段参照、可观察行为、证据要求与后续应答。知识卡由后端检索后提供给教师和AI。"
      />
      {error && (
        <div className="remote-error">
          <CircleAlert />
          {error}
        </div>
      )}
      <div className="knowledge-boundary">
        <ShieldCheck />
        <div>
          <strong>年龄参照不是考试标准</strong>
          <p>
            只输出“已观察到相关表现、部分证据、待继续观察”，稳定判断需要跨时间、跨情境证据。
          </p>
        </div>
        <Badge tone="green">guide-cn-2012.v1.0.0</Badge>
      </div>
      <Panel className="knowledge-filter-panel">
        <div className="focus-pills">
          {Object.entries(gradeLabel).map(([value, label]) => (
            <button
              className={grade === value ? "selected" : ""}
              key={value}
              onClick={() => setGrade(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="focus-pills compact">
          {["全部", "健康", "语言", "社会", "科学", "艺术"].map((item) => (
            <button
              className={domain === item ? "selected" : ""}
              key={item}
              onClick={() => setDomain(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>
      <div className="knowledge-layout">
        <Panel className="knowledge-list">
          <label className="search-input">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索目标或编码"
            />
          </label>
          <div className="knowledge-items">
            {filtered.map((item) => (
              <button
                className={card?.id === item.id ? "selected" : ""}
                onClick={() => setSelected(item.id)}
                key={item.id}
              >
                <div>
                  <Badge tone="blue">{item.subdomain}</Badge>
                  <strong>{item.title}</strong>
                  <span>
                    {item.domain} · {item.age_band}
                  </span>
                  <code>{item.code}</code>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
        </Panel>
        {card ? (
          <div className="detail-stack">
            <Panel>
              <div className="knowledge-title">
                <BookOpen />
                <div>
                  <Badge tone="green">
                    {card.domain} · {card.subdomain}
                  </Badge>
                  <h2>{card.title}</h2>
                  <p>
                    {card.source} · {card.source_version}
                  </p>
                  <code>{card.code}</code>
                </div>
              </div>
            </Panel>
            <Panel title={`${card.age_band}年龄段末期合理期望`}>
              <div className="official-expectations">
                {card.official_expectations.map((item, index) => (
                  <article key={item}>
                    <span>{index + 1}</span>
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </Panel>
            <div className="dashboard-grid">
              <Panel title="游戏中的可观察行为">
                <div className="check-lines">
                  {card.observable_behaviors.map((item) => (
                    <p key={item}>
                      <CheckCircle2 />
                      {item}
                    </p>
                  ))}
                </div>
              </Panel>
              <Panel title="误判提醒">
                <div className="warning-card">
                  <CircleAlert />
                  {card.misunderstanding_warning}
                </div>
              </Panel>
            </div>
            <Panel title="证据最低要求">
              <div className="evidence-requirements">
                {card.evidence_requirements.map((item, index) => (
                  <article key={item}>
                    <span>证据 {index + 1}</span>
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel title="应答设计">
              <div className="response-strategy-grid">
                {Object.entries(card.response_strategies).map(
                  ([category, items]) => (
                    <article key={category}>
                      <Badge tone="purple">{category}</Badge>
                      {items.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </article>
                  ),
                )}
              </div>
            </Panel>
          </div>
        ) : (
          <EmptyState
            title="没有匹配知识卡"
            description="调整年龄班、领域或搜索词。"
          />
        )}
      </div>
    </div>
  );
}

export function RemoteAccountsPage({
  currentUser,
}: {
  currentUser: RemoteUser;
}) {
  const [accounts, setAccounts] = useState<RemoteAccount[]>([]);
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [modal, setModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<RemoteAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    role: "teacher",
    password: "",
    classroomIds: [] as string[],
  });
  const load = async () => {
    const [accountResult, classResult] = await Promise.all([
      remoteApi.accounts(),
      remoteApi.classrooms(),
    ]);
    setAccounts(accountResult.items);
    setClassrooms(classResult.items);
  };
  useEffect(() => {
    load().catch((reason) => setError(showError(reason)));
  }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await remoteApi.createAccount(form);
      setModal(false);
      setForm({
        username: "",
        displayName: "",
        role: "teacher",
        password: "",
        classroomIds: [],
      });
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (account: RemoteAccount) => {
    const status = account.status === "active" ? "disabled" : "active";
    setBusy(true);
    setError("");
    try {
      await remoteApi.setAccountStatus(
        account.user_id,
        status,
        status === "disabled" ? "教研员在账号管理中停用" : undefined,
      );
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordTarget) return;
    setBusy(true);
    setError("");
    try {
      await remoteApi.resetAccountPassword(passwordTarget.user_id, newPassword);
      setPasswordTarget(null);
      setNewPassword("");
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="ACCOUNT GOVERNANCE"
        title="账号与权限管理"
        description="只保留教师和教研员。教研员新增账号并为教师分配班级；停用后历史数据保留，旧会话立即失去业务权限。"
        actions={
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <UserPlus />
            新增账号
          </button>
        }
      />
      {error && (
        <div className="remote-error">
          <CircleAlert />
          {error}
        </div>
      )}
      <div className="account-principle">
        <KeyRound />
        <div>
          <strong>密码由Supabase Auth安全存储</strong>
          <p>前端和童迹业务表均不保存明文密码；service role只存在后端容器。</p>
        </div>
      </div>
      <Panel>
        <div className="remote-account-table">
          <div className="table-head">
            <span>账号</span>
            <span>角色</span>
            <span>班级范围</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {accounts.map((account) => (
            <article key={account.user_id}>
              <div className="account-name">
                <span>{account.display_name.slice(0, 1)}</span>
                <div>
                  <strong>{account.display_name}</strong>
                  <small>{account.username}</small>
                </div>
              </div>
              <Badge tone={account.role === "researcher" ? "purple" : "blue"}>
                {roleLabel[account.role]}
              </Badge>
              <span>
                {account.role === "researcher"
                  ? "全园"
                  : account.classroom_ids
                      .map(
                        (id) => classrooms.find((item) => item.id === id)?.name,
                      )
                      .filter(Boolean)
                      .join("、") || "未分配"}
              </span>
              <Badge tone={tone(account.status)}>
                {statusLabel[account.status]}
              </Badge>
              <div className="remote-row-actions">
                <button className="btn btn-secondary" disabled={busy} onClick={() => { setPasswordTarget(account); setNewPassword(""); }}>重置密码</button>
                <button
                  className={account.status === "active" ? "btn btn-ghost-danger" : "btn btn-secondary"}
                  disabled={busy || account.user_id === currentUser.id}
                  onClick={() => toggle(account)}
                >
                  {account.status === "active" ? "停用账号" : "恢复账号"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      {modal && (
        <Modal
          title="新增系统账号"
          description="账号只能由教研员创建，不开放自主注册。"
          onClose={() => setModal(false)}
        >
          <form className="remote-form" onSubmit={create}>
            <label>
              <span>登录账号</span>
              <input
                required
                pattern="[a-zA-Z0-9._-]{3,40}"
                value={form.username}
                onChange={(event) =>
                  setForm({
                    ...form,
                    username: event.target.value.toLowerCase(),
                  })
                }
              />
            </label>
            <label>
              <span>显示姓名</span>
              <input
                required
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
              />
            </label>
            <label>
              <span>角色</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                <option value="teacher">教师</option>
                <option value="researcher">教研员</option>
              </select>
            </label>
            <label>
              <span>初始密码</span>
              <input
                type="password"
                required
                minLength={10}
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
              />
              <small>至少10位，包含大小写字母和数字</small>
            </label>
            {form.role === "teacher" && (
              <fieldset>
                <legend>分配班级</legend>
                <div className="remote-class-checks">
                  {classrooms.map((item) => (
                    <label key={item.id}>
                      <input
                        type="checkbox"
                        checked={form.classroomIds.includes(item.id)}
                        onChange={() =>
                          setForm({
                            ...form,
                            classroomIds: form.classroomIds.includes(item.id)
                              ? form.classroomIds.filter((id) => id !== item.id)
                              : [...form.classroomIds, item.id],
                          })
                        }
                      />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <button disabled={busy} className="btn btn-primary" type="submit">
              <Save />
              创建账号
            </button>
          </form>
        </Modal>
      )}
      {passwordTarget && (
        <Modal title={`重置${passwordTarget.display_name}的密码`} description="新密码只提交给后端身份服务，不写入童迹业务表。" onClose={() => setPasswordTarget(null)}>
          <form className="remote-form" onSubmit={resetPassword}>
            <label className="full-field"><span>新密码</span><input autoComplete="new-password" required type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <small className="full-field">至少10位，且同时包含大写字母、小写字母和数字。</small>
            <button className="btn btn-primary" disabled={busy} type="submit"><KeyRound />确认重置</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function RemoteQualityPage() {
  const [items, setItems] = useState<RemoteQualityQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    factuality: 4,
    specificity: 4,
    chronology: 4,
    evidenceAlignment: 4,
    subjectivePhrases: "",
    comment: "",
  });
  const load = async () => {
    const result = await remoteApi.qualityReviews();
    setItems(result.items);
    setSelectedId((current) => current || result.items[0]?.observation.id || "");
  };
  useEffect(() => {
    load().catch((reason) => setError(showError(reason)));
  }, []);
  const selected = items.find((item) => item.observation.id === selectedId) ?? items[0];
  useEffect(() => {
    if (!selected) return;
    setForm({
      factuality: selected.review?.factuality ?? 4,
      specificity: selected.review?.specificity ?? 4,
      chronology: selected.review?.chronology ?? 4,
      evidenceAlignment: selected.review?.evidence_alignment ?? 4,
      subjectivePhrases: selected.review?.subjective_phrases.join("，") ?? "",
      comment: selected.review?.comment ?? "",
    });
  }, [selectedId, selected?.review?.updated_at]);
  const save = async (status: "pending" | "passed" | "revision_requested") => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await remoteApi.saveQualityReview({
        observationId: selected.observation.id,
        ...form,
        subjectivePhrases: form.subjectivePhrases
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        status,
      });
      await load();
    } catch (reason) {
      setError(showError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page remote-page">
      <PageHeader
        eyebrow="OBSERVATION QUALITY"
        title="观察质量审核"
        description="独立检查白描的事实性、具体性、时序和证据匹配，只评价记录质量，不评价幼儿能力。"
      />
      {error && <div className="remote-error"><CircleAlert />{error}</div>}
      <div className="quality-banner">
        <ClipboardCheck />
        <div><strong>审核教师怎样记录，不审核幼儿好不好</strong><p>主观词需要替换为可观察动作、原话、材料变化或事件顺序。</p></div>
      </div>
      {!selected ? <EmptyState title="暂无待审核观察" description="教师提交标准观察后会进入此队列。" /> : (
        <div className="master-detail">
          <Panel className="master-list" title="观察队列">
            {items.map((item) => (
              <button className={item.observation.id === selected.observation.id ? "selected" : ""} key={item.observation.id} onClick={() => setSelectedId(item.observation.id)}>
                <div><Badge tone={tone(item.review?.status ?? "pending")}>{statusLabel[item.review?.status ?? "pending"]}</Badge><strong>{item.observation.title}</strong><span>{item.childName} · {new Date(item.observation.occurred_at).toLocaleDateString("zh-CN")}</span></div><ChevronRight />
              </button>
            ))}
          </Panel>
          <div className="detail-stack">
            <Panel title={`${selected.childName} · ${selected.observation.title}`} subtitle="教师原始白描保持只读">
              <div className="review-original">
                <strong>客观观察原稿</strong>
                <p>{selected.observation.teacher_observation}</p>
                {selected.observation.child_quote && <blockquote>幼儿原话：“{selected.observation.child_quote}”</blockquote>}
              </div>
            </Panel>
            <Panel title="四维质量量表" subtitle="1分表示证据薄弱，5分表示记录清楚且可追溯">
              <div className="quality-dimensions">
                {([
                  ["factuality", "事实性"],
                  ["specificity", "具体性"],
                  ["chronology", "时序性"],
                  ["evidenceAlignment", "证据匹配"],
                ] as const).map(([key, label]) => (
                  <article key={key}><div><strong>{label}</strong><span>{form[key]}/5</span></div><input type="range" min="1" max="5" value={form[key]} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} /></article>
                ))}
              </div>
              <form className="teacher-original-form" onSubmit={(event) => event.preventDefault()}>
                <label><span>需改写的主观词语（逗号分隔）</span><input value={form.subjectivePhrases} onChange={(event) => setForm({ ...form, subjectivePhrases: event.target.value })} /></label>
                <label><span>给教师的具体反馈</span><textarea rows={5} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} /></label>
              </form>
              <div className="decision-actions">
                <button className="btn btn-secondary" disabled={busy} onClick={() => void save("pending")}>保存草稿</button>
                <button className="btn btn-ghost-danger" disabled={busy || form.comment.trim().length < 2} onClick={() => void save("revision_requested")}>退回修改</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => void save("passed")}><Check />审核通过</button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

export function RemoteExportsPage({ user }: { user: RemoteUser }) {
  const [items, setItems] = useState<RemoteExportRequest[]>([]);
  const [reports, setReports] = useState<RemotePeriodReport[]>([]);
  const [curriculum, setCurriculum] = useState<RemoteCurriculumClue[]>([]);
  const [research, setResearch] = useState<RemoteResearchActivity[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [form, setForm] = useState({ exportType: "individual_report", resourceId: "", purpose: "", recipient: "", anonymized: true });
  const load = async () => {
    const [requests, reportResult, curriculumResult, researchResult] = await Promise.all([
      remoteApi.exportRequests(),
      remoteApi.reports(),
      remoteApi.curriculumClues(),
      remoteApi.researchActivities(),
    ]);
    setItems(requests.items);
    setReports(reportResult.items);
    setCurriculum(curriculumResult.items);
    setResearch(researchResult.items);
    setSelectedId((current) => current || requests.items[0]?.id || "");
  };
  useEffect(() => {
    load()
      .catch((reason) => setError(showError(reason)))
      .finally(() => setLoaded(true));
  }, []);
  const resourceOptions = useMemo(() => {
    if (form.exportType === "individual_report") {
      return reports.map((item) => ({
        id: item.id,
        label: `${item.report_type === "guardian" ? "家长版" : "教师版"} · ${item.period_start}至${item.period_end}`,
      }));
    }
    if (form.exportType === "curriculum_case") {
      return curriculum.map((item) => ({ id: item.id, label: item.title }));
    }
    return research.map((item) => ({
      id: item.id,
      label: `${item.title} · ${new Date(item.scheduled_at).toLocaleDateString("zh-CN")}`,
    }));
  }, [curriculum, form.exportType, reports, research]);
  const selectedResourceId = resourceOptions.some((item) => item.id === form.resourceId)
    ? form.resourceId
    : resourceOptions[0]?.id || "";
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await remoteApi.createExportRequest({ ...form, resourceId: selectedResourceId });
      setModal(false);
      setForm({ ...form, resourceId: "", purpose: "", recipient: "" });
      await load();
    } catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const decide = async (decision: "approved" | "rejected") => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try { await remoteApi.decideExportRequest(selected.id, decision, decisionNote); setDecisionNote(""); await load(); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const exportLabel: Record<string, string> = { individual_report: "个体报告", classroom_report: "班级报告（历史）", curriculum_case: "课程案例", anonymized_research: "匿名研究数据" };
  const availableExportLabels = Object.entries(exportLabel).filter(([value]) => value !== "classroom_report");
  return (
    <div className="page remote-page">
      <PageHeader eyebrow="EXPORT APPROVAL" title={user.role === "researcher" ? "敏感数据导出审批" : "我的导出申请"} description="报告、课程案例和研究数据离开系统前，确认用途、接收方、授权与去标识条件。" actions={<button className="btn btn-primary" onClick={() => setModal(true)}><Download />申请导出</button>} />
      {error && <div className="remote-error"><CircleAlert />{error}</div>}
      {!loaded ? <LoadingState label="正在加载导出申请…" /> : !selected ? <EmptyState title="暂无导出申请" description="需要将材料带出系统时先创建审批申请。" action={<button className="btn btn-primary" onClick={() => setModal(true)}><Download />创建第一份申请</button>} /> : (
        <div className="master-detail">
          <Panel className="master-list" title="导出申请">
            {items.map((item) => <button className={item.id === selected.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><div><Badge tone={tone(item.status)}>{statusLabel[item.status] ?? item.status}</Badge><strong>{exportLabel[item.export_type]}</strong><span>{item.recipient} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</span></div><ChevronRight /></button>)}
          </Panel>
          <div className="detail-stack"><Panel>
            <div className="approval-title"><div className="approval-icon"><FileCheck2 /></div><div><Badge tone={tone(selected.status)}>{statusLabel[selected.status]}</Badge><h2>{exportLabel[selected.export_type]}</h2><p>接收方：{selected.recipient}</p></div></div>
            <dl className="approval-detail"><div><dt>业务对象</dt><dd>{selected.resource_type} · {selected.resource_id}</dd></div><div><dt>申请用途</dt><dd>{selected.purpose}</dd></div><div><dt>去标识</dt><dd>{selected.anonymized ? "要求匿名化" : "保留身份信息，需核验授权"}</dd></div><div><dt>审批意见</dt><dd>{selected.decision_note || "尚未审批"}</dd></div></dl>
          </Panel>
          {user.role === "researcher" && selected.status === "pending" && <Panel title="审批决定" subtitle="批准只表示允许按申请用途导出，不扩大数据使用范围"><div className="remote-decision"><textarea rows={4} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="填写匿名化条件、使用范围或拒绝原因" /><div><button className="btn btn-ghost-danger" disabled={busy || decisionNote.trim().length < 2} onClick={() => void decide("rejected")}>拒绝</button><button className="btn btn-primary" disabled={busy || decisionNote.trim().length < 2} onClick={() => void decide("approved")}><Check />批准</button></div></div></Panel>}
          </div>
        </div>
      )}
      {modal && <Modal title="创建导出申请" description="系统只记录审批，不在浏览器内自动打包敏感文件。" onClose={() => setModal(false)}><form className="remote-form" onSubmit={create}>
        <label><span>导出类型</span><select value={form.exportType} onChange={(event) => setForm({ ...form, exportType: event.target.value, resourceId: "" })}>{availableExportLabels.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>选择系统内真实对象</span><select required value={selectedResourceId} onChange={(event) => setForm({ ...form, resourceId: event.target.value })}><option value="">{resourceOptions.length ? "请选择" : "暂无可申请对象"}</option>{resourceOptions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label className="full-field"><span>用途</span><textarea required rows={3} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></label>
        <label className="full-field"><span>接收方</span><input required value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} /></label>
        <label className="full-field"><span><input type="checkbox" checked={form.anonymized} onChange={(event) => setForm({ ...form, anonymized: event.target.checked })} /> 已完成或要求导出时去标识</span></label>
        <button className="btn btn-primary" disabled={busy || !selectedResourceId} type="submit"><Save />提交审批</button>
      </form></Modal>}
    </div>
  );
}

export function RemoteResearchPage({ user }: { user: RemoteUser }) {
  const [items, setItems] = useState<RemoteResearchActivity[]>([]);
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entry, setEntry] = useState({ groupName: "本组", objectiveObservation: "", identification: "", responseStrategy: "" });
  const [activityForm, setActivityForm] = useState({ classroomId: "", title: "同一证据的观察、识别与应答对照", scheduledAt: new Date().toISOString().slice(0, 16), sharedEvidenceTitle: "", focusOptions: "事实与解释是否分开，教师何时介入，下一轮如何复察" });
  const load = async () => {
    const [activities, classes] = await Promise.all([remoteApi.researchActivities(), remoteApi.classrooms()]);
    setItems(activities.items); setClassrooms(classes.items); setSelectedId((current) => current || activities.items[0]?.id || "");
  };
  useEffect(() => { load().catch((reason) => setError(showError(reason))); }, []);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await remoteApi.createResearchActivity({ ...activityForm, classroomId: activityForm.classroomId || undefined, scheduledAt: new Date(activityForm.scheduledAt).toISOString(), focusOptions: activityForm.focusOptions.split(/[，,]/).map((item) => item.trim()).filter(Boolean) });
      setModal(false); await load();
    } catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const setStatus = async (status: RemoteResearchActivity["status"]) => {
    if (!selected) return; setBusy(true); setError("");
    try { await remoteApi.updateResearchActivity(selected.id, { status }); await load(); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const saveEntry = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setBusy(true); setError("");
    try { await remoteApi.saveResearchEntry(selected.id, entry); setEntry({ ...entry, objectiveObservation: "", identification: "", responseStrategy: "" }); await load(); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  return (
    <div className="page remote-page">
      <PageHeader eyebrow="COLLABORATIVE INQUIRY" title="教研活动模式" description="围绕同一份真实证据，教师先独立完成观察、识别、应答，再由教研员组织差异对照。" actions={user.role === "researcher" ? <button className="btn btn-primary" onClick={() => setModal(true)}><Microscope />新建教研活动</button> : undefined} />
      {error && <div className="remote-error"><CircleAlert />{error}</div>}
      <div className="research-process"><span>共同观看</span><ArrowRight /><span>独立记录</span><ArrowRight /><span>结构化对照</span><ArrowRight /><span>形成复察问题</span><ArrowRight /><span>回到班级验证</span></div>
      {!selected ? <EmptyState title="暂无教研活动" description="教研员可创建围绕共同证据的结构化研讨。" /> : <>
        <div className="research-hero"><div><Badge tone={tone(selected.status)}>{statusLabel[selected.status]}</Badge><h2>{selected.title}</h2><p>{new Date(selected.scheduled_at).toLocaleString("zh-CN")}</p></div><div className="shared-video"><FileVideo /><span>共同证据</span><strong>{selected.shared_evidence_title || "活动现场指定观察证据"}</strong></div></div>
        <div className="focus-pills compact">{selected.focus_options.map((item) => <button className="selected" key={item}>{item}</button>)}</div>
        {user.role === "researcher" && <div className="decision-actions">{selected.status === "preparing" && <button className="btn btn-primary" disabled={busy} onClick={() => void setStatus("in_progress")}><Play />开始活动</button>}{selected.status === "in_progress" && <button className="btn btn-primary" disabled={busy} onClick={() => void setStatus("completed")}><Check />结束活动</button>}{selected.status === "completed" && <button className="btn btn-secondary" disabled={busy} onClick={() => void setStatus("archived")}>归档</button>}</div>}
        {selected.status === "in_progress" && <Panel title="我的独立记录" subtitle="先完成自己的白描和判断，再查看其他小组内容"><form className="remote-form" onSubmit={saveEntry}><label><span>小组名称</span><input required value={entry.groupName} onChange={(event) => setEntry({ ...entry, groupName: event.target.value })} /></label><label className="full-field"><span>客观观察</span><textarea required minLength={10} rows={4} value={entry.objectiveObservation} onChange={(event) => setEntry({ ...entry, objectiveObservation: event.target.value })} /></label><label className="full-field"><span>专业识别</span><textarea required minLength={5} rows={3} value={entry.identification} onChange={(event) => setEntry({ ...entry, identification: event.target.value })} /></label><label className="full-field"><span>应答策略</span><textarea required minLength={5} rows={3} value={entry.responseStrategy} onChange={(event) => setEntry({ ...entry, responseStrategy: event.target.value })} /></label><button className="btn btn-primary" disabled={busy} type="submit"><Save />保存独立记录</button></form></Panel>}
        <div className="research-groups">{selected.entries.map((item) => <Panel key={item.id}><div className="group-head"><span>{item.group_name.slice(0, 1)}</span><div><strong>{item.group_name}</strong><small>独立提交版本</small></div><Badge tone="green">已提交</Badge></div><section><Badge tone="green">观察</Badge><p>{item.objective_observation}</p></section><section><Badge tone="blue">识别</Badge><p>{item.identification}</p></section><section><Badge tone="purple">应答</Badge><p>{item.response_strategy}</p></section></Panel>)}</div>
        {selected.status !== "in_progress" && selected.entries.length === 0 && <EmptyState title="尚无小组记录" description="活动开始后，教师可以提交各自的观察、识别和应答。" />}
      </>}
      {modal && <Modal title="新建教研活动" description="可面向某个班级，也可创建全园活动。" onClose={() => setModal(false)}><form className="remote-form" onSubmit={create}><label><span>活动范围</span><select value={activityForm.classroomId} onChange={(event) => setActivityForm({ ...activityForm, classroomId: event.target.value })}><option value="">全园教师</option>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>计划时间</span><input required type="datetime-local" value={activityForm.scheduledAt} onChange={(event) => setActivityForm({ ...activityForm, scheduledAt: event.target.value })} /></label><label className="full-field"><span>活动名称</span><input required value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} /></label><label className="full-field"><span>共同证据说明</span><input value={activityForm.sharedEvidenceTitle} onChange={(event) => setActivityForm({ ...activityForm, sharedEvidenceTitle: event.target.value })} /></label><label className="full-field"><span>观察重点（逗号分隔）</span><textarea required rows={3} value={activityForm.focusOptions} onChange={(event) => setActivityForm({ ...activityForm, focusOptions: event.target.value })} /></label><button className="btn btn-primary" disabled={busy} type="submit"><Save />创建活动</button></form></Modal>}
    </div>
  );
}

export function RemoteGrowthPage() {
  const [children, setChildren] = useState<RemoteChild[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [growth, setGrowth] = useState<RemoteGrowthResult | null>(null);
  const [followUp, setFollowUp] = useState<RemoteSupportAction | null>(null);
  const [followUpForm, setFollowUpForm] = useState({ childResponse: "", effectiveness: "continue" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    remoteApi.children().then((result) => {
      const active = result.items.filter((item) => item.status === "active");
      setChildren(active);
      setSelectedId(active[0]?.id || "");
      if (!active.length) setLoading(false);
    }).catch((reason) => {
      setError(showError(reason));
      setLoading(false);
    });
  }, []);
  const loadGrowth = async (childId: string) => {
    if (!childId) { setGrowth(null); return; }
    setLoading(true);
    try { setGrowth(await remoteApi.growth(childId)); }
    catch (reason) { setError(showError(reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadGrowth(selectedId); }, [selectedId]);
  const advanceSupport = async (support: RemoteSupportAction) => {
    if (support.status === "follow_up") { setFollowUp(support); return; }
    const next: Record<string, string> = { planned: "implemented", implemented: "follow_up", verified: "closed" };
    if (!next[support.status]) return;
    setBusy(true);
    try { await remoteApi.updateSupportAction(support.id, { status: next[support.status] }); await loadGrowth(selectedId); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); if (!followUp) return; setBusy(true);
    try { await remoteApi.updateSupportAction(followUp.id, { status: "verified", ...followUpForm }); setFollowUp(null); setFollowUpForm({ childResponse: "", effectiveness: "continue" }); await loadGrowth(selectedId); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  return <div className="page remote-page">
    <PageHeader eyebrow="GROWTH & RESPONSE" title="成长轨迹与应答追踪" description="只纳入教师明确采用的AI建议和后续证据；应答必须实施、复察，才能讨论支持效果。" actions={<select className="child-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{children.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}
    {loading ? <LoadingState label="正在整理成长轨迹…" /> : !growth ? <EmptyState title="暂无成长证据" description="完成观察并采用AI建议后，时间轴会显示在这里。" /> : <>
      <div className="metrics-row"><Metric icon={<Activity />} value={growth.coverage.observations} label="已采用观察" detail={`${growth.coverage.scenes.length}类游戏场景`} /><Metric icon={<Sprout />} value={growth.coverage.themes.length} label="持续兴趣" detail={growth.coverage.themes.join("、") || "待积累"} tone="blue" /><Metric icon={<CheckCircle2 />} value={growth.coverage.verifiedSupports} label="已验证应答" detail="有复察证据" tone="green" /></div>
      <div className="detail-stack">{growth.timeline.map((item) => <Panel key={item.observation.id}><div className="remote-detail-head"><div><Badge tone="green">{stageLabel[item.observation.organization_stage]}</Badge><h2>{item.observation.title}</h2><p>{new Date(item.observation.occurred_at).toLocaleDateString("zh-CN")} · {item.observation.scene} · {item.observation.theme}</p></div><Badge tone="blue">教师已采用</Badge></div><div className="remote-analysis-layers"><article className="fact"><span>事实</span><p>{item.analysis?.structured_result.objectiveSummary ?? item.observation.teacher_observation}</p></article><article className="interpret"><span>识别</span><p>{item.analysis?.structured_result.currentExperience ?? item.observation.teacher_identification}</p></article><article className="hypothesis"><span>下一次观察</span><p>{item.analysis?.structured_result.nextObservation.join("；") || item.observation.teacher_response.nextObservationFocus}</p></article></div>{item.supports.map((support) => <div className="support-head" key={support.id}><div><Badge tone={tone(support.status)}>{statusLabel[support.status]}</Badge><h3>{responseLabel[support.category]}：{support.strategy}</h3><p>{support.next_observation_focus}{support.child_response ? ` · 后续反应：${support.child_response}` : ""}</p></div>{support.status !== "closed" && <button className="btn btn-secondary" disabled={busy} onClick={() => void advanceSupport(support)}>{support.status === "planned" ? "记录已实施" : support.status === "implemented" ? "进入复察" : support.status === "follow_up" ? "填写复察证据" : "关闭行动"}</button>}</div>)}</Panel>)}</div>
    </>}
    {followUp && <Modal title="记录复察证据" description="效果判断必须依据支持后幼儿实际发生的行为。" onClose={() => setFollowUp(null)}><form className="remote-form" onSubmit={verify}><label className="full-field"><span>幼儿后续反应</span><textarea required minLength={5} rows={5} value={followUpForm.childResponse} onChange={(event) => setFollowUpForm({ ...followUpForm, childResponse: event.target.value })} /></label><label><span>效果判断</span><select value={followUpForm.effectiveness} onChange={(event) => setFollowUpForm({ ...followUpForm, effectiveness: event.target.value })}><option value="supported">已有支持证据</option><option value="continue">继续验证</option><option value="insufficient">支持不足</option></select></label><button className="btn btn-primary" disabled={busy} type="submit"><Save />保存复察</button></form></Modal>}
  </div>;
}

export function RemoteReportsPage() {
  const [reports, setReports] = useState<RemotePeriodReport[]>([]);
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [children, setChildren] = useState<RemoteChild[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ classroomId: "", childId: "", reportType: "teacher", periodStart: new Date(new Date().setDate(1)).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10) });
  const load = async () => {
    const [reportResult, classResult, childResult] = await Promise.all([remoteApi.reports(), remoteApi.classrooms(), remoteApi.children()]);
    const activeClasses = classResult.items.filter((item) => item.status === "active");
    const activeChildren = childResult.items.filter((item) => item.status === "active");
    setReports(reportResult.items); setClassrooms(activeClasses); setChildren(activeChildren); setSelectedId((current) => current || reportResult.items[0]?.id || "");
    setForm((current) => ({ ...current, classroomId: current.classroomId || activeClasses[0]?.id || "", childId: current.childId || activeChildren[0]?.id || "" }));
  };
  useEffect(() => {
    load()
      .catch((reason) => setError(showError(reason)))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => { const first = children.find((child) => child.classroom_id === form.classroomId); if (first && !children.some((child) => child.id === form.childId && child.classroom_id === form.classroomId)) setForm((current) => ({ ...current, childId: first.id })); }, [form.classroomId, children]);
  const selected = reports.find((item) => item.id === selectedId) ?? reports[0];
  const generate = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await remoteApi.generateReport(form); setModal(false); await load(); setSelectedId(result.item.id); }
    catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  const advance = async () => {
    if (!selected) return; const next: Record<string, string> = { draft: "reviewed", reviewed: "published", published: "withdrawn" }; if (!next[selected.status]) return;
    setBusy(true); try { await remoteApi.updateReportStatus(selected.id, next[selected.status]); await load(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); }
  };
  return <div className="page remote-page"><PageHeader eyebrow="PERIOD REPORT" title="标准周期报告" description="教师版保留专业分析，家长版使用非比较、非标签化语言；所有结论均回链已采用证据。" actions={<div className="page-action-row"><button className="btn btn-secondary" disabled={!selected} onClick={() => window.print()}>浏览器打印</button><button className="btn btn-primary" onClick={() => setModal(true)}><Plus />生成报告</button></div>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}
    {!loaded ? <LoadingState label="正在加载周期报告…" /> : !selected ? <EmptyState title="暂无周期报告" description="选择幼儿与周期后，系统只汇总教师已采用的证据。" action={<button className="btn btn-primary" onClick={() => setModal(true)}><Plus />生成第一份报告</button>} /> : <div className="report-layout"><Panel className="report-list" title="报告列表">{reports.map((report) => <button className={report.id === selected.id ? "selected" : ""} onClick={() => setSelectedId(report.id)} key={report.id}><div><strong>{report.content.title}</strong><span>{report.period_start} 至 {report.period_end}</span></div><Badge tone={tone(report.status)}>{statusLabel[report.status]}</Badge></button>)}</Panel><article className="report-paper"><header><div><span>童迹 3.0 · {selected.report_type === "teacher" ? "教师专业版" : "家庭交流版"}{selected.content.aiMeta ? ` · ${selected.content.aiMeta.provider === "QianwenAIProvider" ? "千问AI" : "模拟AI"}` : ""}</span><h1>{selected.content.title}</h1><p>{selected.period_start} 至 {selected.period_end}</p></div><Badge tone={tone(selected.status)}>{statusLabel[selected.status]}</Badge></header><section className="report-highlight"><Sprout /><div><strong>{selected.content.observationCoverage}</strong><p>{selected.content.evidenceBoundary}</p></div></section><div className="report-sections"><section><span>01</span><h2>主要兴趣</h2>{selected.content.interests.map((item) => <p key={item}>• {item}</p>)}</section><section><span>02</span><h2>有证据支持的变化</h2>{selected.content.evidencedGrowth.map((item) => <p key={item}>• {item}</p>)}</section><section><span>03</span><h2>教师支持及效果</h2>{selected.content.teacherSupport.map((item) => <p key={item}>• {item}</p>)}</section><section><span>04</span><h2>{selected.report_type === "guardian" ? "家庭共玩建议" : "待验证与下一计划"}</h2>{(selected.report_type === "guardian" ? selected.content.familySuggestions : [...selected.content.pendingQuestions, ...selected.content.nextPlan]).map((item) => <p key={item}>• {item}</p>)}</section></div><footer><span>证据索引：{selected.evidence_observation_ids.join(" · ")}</span>{selected.status !== "withdrawn" && <button className="btn btn-secondary" disabled={busy} onClick={() => void advance()}>{selected.status === "draft" ? "完成教师审核" : selected.status === "reviewed" ? "正式发布" : "撤回报告"}</button>}</footer></article></div>}
    {modal && <Modal title="生成标准周期报告" description="本周期没有已采用证据时，系统会拒绝生成正式报告。" onClose={() => setModal(false)}><form className="remote-form" onSubmit={generate}><label><span>班级</span><select required value={form.classroomId} onChange={(event) => setForm({ ...form, classroomId: event.target.value })}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>幼儿</span><select required value={form.childId} onChange={(event) => setForm({ ...form, childId: event.target.value })}>{children.filter((child) => child.classroom_id === form.classroomId).map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select></label><label><span>报告版本</span><select value={form.reportType} onChange={(event) => setForm({ ...form, reportType: event.target.value })}><option value="teacher">教师专业版</option><option value="guardian">家长交流版</option></select></label><label><span>开始日期</span><input required type="date" value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} /></label><label><span>结束日期</span><input required type="date" value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} /></label><button className="btn btn-primary" disabled={busy} type="submit"><Save />生成草稿</button></form></Modal>}
  </div>;
}

export function RemoteCurriculumPage() {
  const [classrooms, setClassrooms] = useState<RemoteClassroom[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [items, setItems] = useState<RemoteCurriculumClue[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState({ questions: "", experience: "", materials: "", pathways: "", observationFocus: "" });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { const [classes, clues] = await Promise.all([remoteApi.classrooms(), remoteApi.curriculumClues()]); const active = classes.items.filter((item) => item.status === "active"); setClassrooms(active); setClassroomId((current) => current || active[0]?.id || ""); setItems(clues.items); setSelectedId((current) => current || clues.items[0]?.id || ""); };
  useEffect(() => {
    load()
      .catch((reason) => setError(showError(reason)))
      .finally(() => setLoaded(true));
  }, []);
  const visible = items.filter((item) => !classroomId || item.classroom_id === classroomId);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  useEffect(() => { if (!selected) return; const plan = selected.plan as Record<string, unknown>; setEditor({ questions: selected.inquiry_questions.join("\n"), experience: ((plan.existingExperience as string[]) ?? []).join("\n"), materials: ((plan.environmentAndMaterials as string[]) ?? []).join("\n"), pathways: ((plan.possiblePathways as string[]) ?? []).join("\n"), observationFocus: ((plan.observationFocus as string[]) ?? []).join("\n") }); }, [selectedId, selected?.updated_at]);
  const scan = async () => { if (!classroomId) return; setBusy(true); setError(""); try { await remoteApi.scanCurriculum(classroomId); await load(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } };
  const lines = (value: string) => value.split(/\n/).map((item) => item.trim()).filter(Boolean);
  const save = async () => { if (!selected) return; setBusy(true); try { await remoteApi.updateCurriculumClue(selected.id, { inquiryQuestions: lines(editor.questions), plan: { ...selected.plan, existingExperience: lines(editor.experience), environmentAndMaterials: lines(editor.materials), possiblePathways: lines(editor.pathways), observationFocus: lines(editor.observationFocus) } }); await load(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } };
  const advance = async () => { if (!selected) return; const next: Record<string, string> = { clue: "draft", draft: "reviewed", reviewed: "active", active: "reflected" }; if (!next[selected.status]) return; setBusy(true); try { await remoteApi.updateCurriculumClue(selected.id, { status: next[selected.status] }); await load(); } catch (reason) { setError(showError(reason)); } finally { setBusy(false); } };
  return <div className="page remote-page"><PageHeader eyebrow="EMERGENT CURRICULUM" title="从持续游戏证据生成课程" description="课程不是固定活动清单。系统达到跨幼儿或连续观察门槛后只生成可修改线索，教师决定课程路径。" actions={<div className="page-action-row"><select className="child-select" value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setSelectedId(""); }}>{classrooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="btn btn-primary" disabled={busy || !classroomId} onClick={() => void scan()}><BrainCircuit />扫描课程线索</button></div>} />
    {error && <div className="remote-error"><CircleAlert />{error}</div>}<div className="curriculum-threshold"><span><CheckCircle2 />相近兴趣</span><ArrowRight /><span><CheckCircle2 />至少2名幼儿或同一幼儿3次</span><ArrowRight /><span><CheckCircle2 />至少2个时间点</span><ArrowRight /><span><CheckCircle2 />教师可编辑路径</span></div>
    {!loaded ? <LoadingState label="正在加载课程线索…" /> : !selected ? <EmptyState title="尚未形成课程线索" description="继续积累已采用的多幼儿、多时间点观察，再运行扫描。" action={<button className="btn btn-primary" disabled={busy || !classroomId} onClick={() => void scan()}><BrainCircuit />扫描当前班级</button>} /> : <div className="master-detail"><Panel className="master-list" title="课程线索">{visible.map((item) => <button className={item.id === selected.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><div><Badge tone={item.threshold_met ? "green" : "orange"}>{item.threshold_met ? "达到门槛" : "继续观察"}</Badge><strong>{item.title}</strong><span>{item.child_ids.length}名幼儿 · {item.time_point_count}个时间点</span></div><ChevronRight /></button>)}</Panel><article className="curriculum-paper"><header><div><span>生成性课程草案 · V{Number(selected.plan.version ?? 1)}{selected.plan.aiMeta ? ` · ${selected.plan.aiMeta.provider === "QianwenAIProvider" ? "千问AI" : "模拟AI"}` : ""}</span><h1>{selected.title}</h1><p>{selected.origin}</p></div><div className="curriculum-status-actions"><Badge tone={tone(selected.status)}>{statusLabel[selected.status]}</Badge><button className="btn btn-secondary" disabled={busy} onClick={() => void advance()}>{selected.status === "reflected" ? "已完成复盘" : "推进课程状态"}</button></div></header><div className="curriculum-sections"><section><span>01</span><h2>幼儿已有经验</h2><textarea rows={7} value={editor.experience} onChange={(event) => setEditor({ ...editor, experience: event.target.value })} /></section><section><span>02</span><h2>核心探究问题</h2><textarea rows={7} value={editor.questions} onChange={(event) => setEditor({ ...editor, questions: event.target.value })} /></section><section><span>03</span><h2>环境与材料</h2><textarea rows={7} value={editor.materials} onChange={(event) => setEditor({ ...editor, materials: event.target.value })} /></section><section><span>04</span><h2>可能路径与观察重点</h2><textarea rows={4} value={editor.pathways} onChange={(event) => setEditor({ ...editor, pathways: event.target.value })} /><textarea rows={3} value={editor.observationFocus} onChange={(event) => setEditor({ ...editor, observationFocus: event.target.value })} /></section></div><div className="evidence-chain"><strong>课程证据回链</strong><p>{selected.evidence_observation_ids.length}条已采用观察</p><div>{selected.evidence_observation_ids.map((id) => <span className="badge" key={id}>{id.slice(0, 8)}</span>)}</div></div><footer><button className="btn btn-primary" disabled={busy} onClick={() => void save()}><Save />保存新版本</button></footer></article></div>}
  </div>;
}
