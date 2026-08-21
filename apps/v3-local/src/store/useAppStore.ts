import { create } from "zustand";
import type {
  AnalysisClaim, DemoSnapshot, ExportRequest, IndividualReport, ChildImportRow, GamePlan, CurriculumPlan,
  NewEvidencePackageInput, ObservationQualityReview, ResearchActivity,
  Role, SupportAction, UserAccount,
} from "../domain/types";
import { TENANT_ID } from "../data/seed";
import { localRepository, makeId } from "../services/localRepository";
import { scenarioAIProvider } from "../services/scenarioAI";

type Notice = { type: "success" | "error" | "info"; message: string } | null;

const emptySnapshot: DemoSnapshot = {
  classrooms: [], userAccounts: [], children: [], gamePlans: [], observationFocuses: [],
  evidencePackages: [], observationSubjects: [], mediaEvidence: [], analysisRuns: [], claims: [],
  supportActions: [], growthStatements: [], individualReports: [], classReports: [],
  curriculumClues: [], curriculumPlans: [], knowledgeCards: [], qualityReviews: [],
  exportRequests: [], researchActivities: [], audits: [],
};

interface AppState extends DemoSnapshot {
  loading: boolean;
  busy: boolean;
  role: Role;
  selectedChildId: string;
  selectedPackageId: string;
  notice: Notice;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  setRole(role: Role): void;
  selectChild(id: string): void;
  selectPackage(id: string): void;
  clearNotice(): void;
  createEvidence(input: NewEvidencePackageInput): Promise<void>;
  submitPackage(id: string): Promise<void>;
  analyzeVideo(id: string): Promise<void>;
  runAnalysis(id: string): Promise<void>;
  reviewClaim(claim: AnalysisClaim, status: AnalysisClaim["reviewStatus"], revision?: string): Promise<void>;
  integratePackage(id: string): Promise<void>;
  updateSupport(action: SupportAction): Promise<void>;
  saveQualityReview(review: ObservationQualityReview, status: ObservationQualityReview["status"], comment: string): Promise<void>;
  decideExport(request: ExportRequest, status: "已通过" | "已拒绝", note: string): Promise<void>;
  requestReportExport(report: IndividualReport): Promise<void>;
  toggleAccount(account: UserAccount, reason: string): Promise<void>;
  advanceResearch(activity: ResearchActivity): Promise<void>;
  advanceReport(report: IndividualReport): Promise<void>;
  importChildren(rows: ChildImportRow[]): Promise<void>;
  saveGamePlan(plan: GamePlan): Promise<void>;
  advanceCurriculum(plan: CurriculumPlan): Promise<void>;
  scanCurriculum(): void;
  resetDemo(): Promise<void>;
}

const withNotice = (error: unknown) => ({ notice: { type: "error" as const, message: error instanceof Error ? error.message : "操作失败" }, busy: false });

export const useAppStore = create<AppState>((set, get) => ({
  ...emptySnapshot,
  loading: true,
  busy: false,
  role: "teacher",
  selectedChildId: "child-1",
  selectedPackageId: "pkg-1",
  notice: null,

  initialize: async () => {
    try {
      await localRepository.initialize();
      const snapshot = await localRepository.snapshot();
      set({ ...snapshot, loading: false });
    } catch (error) {
      set({ ...withNotice(error), loading: false });
    }
  },

  refresh: async () => set(await localRepository.snapshot()),
  setRole: (role) => set({ role }),
  selectChild: (selectedChildId) => set({ selectedChildId }),
  selectPackage: (selectedPackageId) => set({ selectedPackageId }),
  clearNotice: () => set({ notice: null }),

  createEvidence: async (input) => {
    set({ busy: true });
    try {
      const created = await localRepository.createEvidencePackage(input);
      await get().refresh();
      set({ busy: false, selectedPackageId: created.id, notice: { type: "success", message: "证据包草稿已保存。请检查教师原始判断后再提交。" } });
    } catch (error) { set(withNotice(error)); throw error; }
  },

  submitPackage: async (id) => {
    set({ busy: true });
    try {
      await localRepository.submitEvidencePackage(id);
      await get().refresh();
      set({ busy: false, notice: { type: "success", message: "教师原始观察、识别与应答已提交，现可运行模拟AI对照。" } });
    } catch (error) { set(withNotice(error)); }
  },

  analyzeVideo: async (id) => {
    set({ busy: true });
    try {
      await localRepository.simulateVideoAnalysis(id);
      await get().refresh();
      set({ busy: false, notice: { type: "success", message: "模拟视频行为分析完成。时间轴与转写仍需教师回看确认。" } });
    } catch (error) { set(withNotice(error)); }
  },

  runAnalysis: async (id) => {
    const pkg = get().evidencePackages.find((item) => item.id === id);
    if (!pkg) return;
    const subjects = get().observationSubjects.filter((item) => item.evidencePackageId === id);
    const media = get().mediaEvidence.filter((item) => item.evidencePackageId === id);
    set({ busy: true });
    try {
      const result = await scenarioAIProvider.analyze(pkg, subjects, media, {
        children: get().children,
        knowledgeCards: get().knowledgeCards,
      });
      await localRepository.saveAnalysis(result, id);
      await get().refresh();
      set({ busy: false, notice: { type: "success", message: "模拟AI对照草稿已生成。请逐条审核，不会自动进入成长结论。" } });
    } catch (error) { set(withNotice(error)); }
  },

  reviewClaim: async (claim, status, revision) => {
    await localRepository.reviewClaim(claim.id, status, revision);
    await get().refresh();
    set({ notice: { type: "success", message: `已将该${claim.layer}结论标记为“${status}”。` } });
  },

  integratePackage: async (id) => {
    const runs = get().analysisRuns.filter((item) => item.evidencePackageId === id);
    const relatedClaims = get().claims.filter((claim) => runs.some((run) => run.id === claim.analysisRunId));
    if (relatedClaims.some((claim) => claim.reviewStatus === "待审核")) {
      set({ notice: { type: "error", message: "仍有AI结论待审核，请逐条采用、修改、拒绝或标记待验证。" } });
      return;
    }
    await localRepository.integratePackage(id);
    await get().refresh();
    set({ notice: { type: "success", message: "教师对照整合已完成，审核结果可用于后续成长追踪。" } });
  },

  updateSupport: async (action) => {
    await localRepository.saveSupportAction(action);
    await get().refresh();
    set({ notice: { type: "success", message: `支持行动已更新为“${action.status}”。` } });
  },

  saveQualityReview: async (review, status, comment) => {
    await localRepository.saveQualityReview({ ...review, status, comment });
    await get().refresh();
    set({ notice: { type: "success", message: status === "通过" ? "观察质量审核已通过。" : status === "退回修改" ? "已退回教师补充客观证据。" : "审核意见已保存。" } });
  },

  decideExport: async (request, status, note) => {
    await localRepository.decideExport(request, status, note);
    await get().refresh();
    set({ notice: { type: "success", message: `导出申请已${status === "已通过" ? "通过" : "拒绝"}。` } });
  },

  requestReportExport: async (report) => {
    const now = new Date().toISOString();
    const request: ExportRequest = {
      id: makeId("export"), tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1,
      applicantName: "陈老师", classroomId: report.classroomId, exportType: "个体报告", objectId: report.id,
      purpose: `与${report.childName}监护人进行${report.periodLabel}成长交流`, recipient: "幼儿监护人", status: "待审批",
    };
    await localRepository.requestExport(request);
    await get().refresh();
    set({ notice: { type: "success", message: "导出申请已提交，审批通过前不会生成外发文件。" } });
  },

  toggleAccount: async (account, reason) => {
    await localRepository.toggleAccount(account, reason || "演示账号权限调整");
    await get().refresh();
    set({ notice: { type: "success", message: account.status === "启用" ? "账号已停用，历史记录仍保留。" : "账号已重新启用。" } });
  },

  advanceResearch: async (activity) => {
    const status = activity.status === "准备中" ? "进行中" : activity.status === "进行中" ? "已完成" : "准备中";
    await localRepository.saveResearchActivity({ ...activity, status });
    await get().refresh();
    set({ notice: { type: "success", message: `教研活动已进入“${status}”。` } });
  },

  advanceReport: async (report) => {
    const status = report.status === "草稿" ? "教师已审核" : report.status === "教师已审核" ? "已发布" : "草稿";
    await localRepository.saveIndividualReport({ ...report, status });
    await get().refresh();
    set({ notice: { type: "success", message: `报告状态已更新为“${status}”。` } });
  },

  importChildren: async (rows) => {
    set({ busy: true });
    try {
      await localRepository.importChildren(rows);
      await get().refresh();
      set({ busy: false, notice: { type: "success", message: `已导入 ${rows.length} 名幼儿，数据仅保存在当前浏览器。` } });
    } catch (error) { set(withNotice(error)); throw error; }
  },

  saveGamePlan: async (plan) => {
    await localRepository.saveGamePlan(plan);
    await get().refresh();
    set({ notice: { type: "success", message: "游戏计划已保存，并可在证据包中选择关联。" } });
  },

  advanceCurriculum: async (plan) => {
    const order: CurriculumPlan["status"][] = ["线索", "草案", "待教研确认", "已确认", "实施中", "已复盘"];
    const next = order[(order.indexOf(plan.status) + 1) % order.length];
    await localRepository.saveCurriculumPlan({ ...plan, status: next });
    await get().refresh();
    set({ notice: { type: "success", message: `课程草案已保存为新版本，状态为“${next}”。` } });
  },

  scanCurriculum: () => set({ notice: { type: "info", message: `本地线索引擎已扫描 ${get().evidencePackages.length} 个证据包：2条达到课程阈值，1条建议继续观察。` } }),

  resetDemo: async () => {
    set({ busy: true });
    await localRepository.reset();
    await get().refresh();
    set({ busy: false, selectedChildId: "child-1", selectedPackageId: "pkg-1", notice: { type: "success", message: "已恢复童迹3.0标准演示数据。" } });
  },
}));
