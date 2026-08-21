import type {
  AIAnalysisRun, AnalysisClaim, AuditEvent, Child, ChildImportRow, DemoSnapshot,
  EvidencePackage, ExportRequest, GamePlan, IndividualReport, MediaEvidence,
  NewEvidencePackageInput, ObservationQualityReview, ObservationSubject, CurriculumPlan,
  ResearchActivity, Role, SupportAction, UserAccount,
} from "../domain/types";
import { DEMO_DATA_VERSION, seedSnapshot, TENANT_ID } from "../data/seed";
import type { AuthProvider, AuthSession, EvidenceRepository, MediaStorage } from "./contracts";
import { db } from "./db";

export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const stamp = () => new Date().toISOString();

const tables = () => [
  db.classrooms, db.userAccounts, db.children, db.gamePlans, db.observationFocuses,
  db.evidencePackages, db.observationSubjects, db.mediaEvidence, db.analysisRuns,
  db.claims, db.supportActions, db.growthStatements, db.individualReports,
  db.classReports, db.curriculumClues, db.curriculumPlans, db.knowledgeCards,
  db.qualityReviews, db.exportRequests, db.researchActivities, db.audits, db.meta,
];

export class IndexedDbRepository implements EvidenceRepository {
  async initialize() {
    const version = await db.meta.get("dataVersion");
    if (version?.value !== DEMO_DATA_VERSION || (await db.children.count()) === 0) await this.reset();
  }

  async reset() {
    await db.transaction("rw", tables(), async () => {
      await Promise.all(tables().map((table) => table.clear()));
      await Promise.all([
        db.classrooms.bulkAdd(seedSnapshot.classrooms),
        db.userAccounts.bulkAdd(seedSnapshot.userAccounts),
        db.children.bulkAdd(seedSnapshot.children),
        db.gamePlans.bulkAdd(seedSnapshot.gamePlans),
        db.observationFocuses.bulkAdd(seedSnapshot.observationFocuses),
        db.evidencePackages.bulkAdd(seedSnapshot.evidencePackages),
        db.observationSubjects.bulkAdd(seedSnapshot.observationSubjects),
        db.mediaEvidence.bulkAdd(seedSnapshot.mediaEvidence),
        db.analysisRuns.bulkAdd(seedSnapshot.analysisRuns),
        db.claims.bulkAdd(seedSnapshot.claims),
        db.supportActions.bulkAdd(seedSnapshot.supportActions),
        db.growthStatements.bulkAdd(seedSnapshot.growthStatements),
        db.individualReports.bulkAdd(seedSnapshot.individualReports),
        db.classReports.bulkAdd(seedSnapshot.classReports),
        db.curriculumClues.bulkAdd(seedSnapshot.curriculumClues),
        db.curriculumPlans.bulkAdd(seedSnapshot.curriculumPlans),
        db.knowledgeCards.bulkAdd(seedSnapshot.knowledgeCards),
        db.qualityReviews.bulkAdd(seedSnapshot.qualityReviews),
        db.exportRequests.bulkAdd(seedSnapshot.exportRequests),
        db.researchActivities.bulkAdd(seedSnapshot.researchActivities),
        db.audits.bulkAdd(seedSnapshot.audits),
        db.meta.put({ key: "dataVersion", value: DEMO_DATA_VERSION }),
      ]);
    });
  }

  async snapshot(): Promise<DemoSnapshot> {
    const [
      classrooms, userAccounts, children, gamePlans, observationFocuses,
      evidencePackages, observationSubjects, mediaEvidence, analysisRuns, claims,
      supportActions, growthStatements, individualReports, classReports,
      curriculumClues, curriculumPlans, knowledgeCards, qualityReviews,
      exportRequests, researchActivities, audits,
    ] = await Promise.all([
      db.classrooms.toArray(), db.userAccounts.toArray(), db.children.toArray(), db.gamePlans.toArray(), db.observationFocuses.toArray(),
      db.evidencePackages.toArray(), db.observationSubjects.toArray(), db.mediaEvidence.toArray(), db.analysisRuns.toArray(), db.claims.toArray(),
      db.supportActions.toArray(), db.growthStatements.toArray(), db.individualReports.toArray(), db.classReports.toArray(),
      db.curriculumClues.toArray(), db.curriculumPlans.toArray(), db.knowledgeCards.toArray(), db.qualityReviews.toArray(),
      db.exportRequests.toArray(), db.researchActivities.toArray(), db.audits.orderBy("createdAt").reverse().toArray(),
    ]);
    return { classrooms, userAccounts, children, gamePlans, observationFocuses, evidencePackages, observationSubjects, mediaEvidence, analysisRuns, claims, supportActions, growthStatements, individualReports, classReports, curriculumClues, curriculumPlans, knowledgeCards, qualityReviews, exportRequests, researchActivities, audits };
  }

  async addAudit(role: Role | "system", action: string, objectType: string, objectId: string, detail: string) {
    const now = stamp();
    const event: AuditEvent = { id: makeId("audit"), tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: role, version: 1, actorRole: role, action, objectType, objectId, detail };
    await db.audits.add(event);
  }

  async createEvidencePackage(input: NewEvidencePackageInput) {
    if (!input.childIds.length) throw new Error("至少选择一名观察幼儿");
    if (!input.teacherObservation.trim() && !input.files.length) throw new Error("请填写客观白描或上传媒体证据");
    if (input.files.length > 5) throw new Error("单次证据包最多包含5个媒体文件");
    const children = await db.children.where("id").anyOf(input.childIds).toArray();
    const now = stamp();
    const packageId = makeId("pkg");
    const packageSubjectIds = children.map(() => makeId("subject"));
    const subjects: ObservationSubject[] = children.map((child, index) => ({
      id: packageSubjectIds[index], tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1,
      evidencePackageId: packageId, childId: child.id, childName: child.alias, role: index === 0 ? "主要观察" : "关联观察",
      visualCue: index === 0 ? `${child.alias}为主要观察幼儿，请在视频中补充衣着或位置线索。` : `${child.alias}为关联观察幼儿。`,
      teacherObservation: input.teacherObservation.trim() || "教师已上传关键视频片段，客观白描待对照视频补充。",
      childQuote: input.childQuote, teacherIdentification: input.teacherIdentification,
      teacherResponseDraft: { category: input.responseCategory, strategy: input.responseStrategy, nextObservationFocus: input.nextObservationFocus },
    }));
    const media: MediaEvidence[] = [];
    for (const file of input.files) media.push(await localMediaStorage.toRecord(file, packageId, media.length));
    const created: EvidencePackage = {
      id: packageId, tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1,
      classroomId: children[0]?.classroomId ?? "class-1", title: input.title, observedAt: input.observedAt,
      durationMinutes: input.durationMinutes, scene: input.scene, theme: input.theme,
      observationFocusIds: input.observationFocusIds, gamePlanId: input.gamePlanId || undefined,
      subjectIds: subjects.map((item) => item.id), mediaEvidenceIds: media.map((item) => item.id),
      status: "教师草稿", evidenceSufficiency: media.length && input.teacherObservation.trim() ? "中等" : "初步",
    };
    await db.transaction("rw", [db.evidencePackages, db.observationSubjects, db.mediaEvidence], async () => {
      await db.evidencePackages.add(created);
      await db.observationSubjects.bulkAdd(subjects);
      if (media.length) await db.mediaEvidence.bulkAdd(media);
    });
    await this.addAudit("teacher", "创建证据包草稿", "EvidencePackage", created.id, `包含 ${children.length} 名幼儿、${media.length} 项媒体；教师原始判断尚未提交。`);
    return created;
  }

  async submitEvidencePackage(id: string) {
    const item = await db.evidencePackages.get(id);
    if (!item) throw new Error("证据包不存在");
    const now = stamp();
    await db.evidencePackages.update(id, { status: "教师已提交", teacherSubmittedAt: now, updatedAt: now, version: item.version + 1 });
    await this.addAudit("teacher", "提交教师原始判断", "EvidencePackage", id, "提交后原始白描、识别和应答作为版本证据保留，再开放模拟AI分析。" );
  }

  async saveAnalysis(result: { runs: AIAnalysisRun[]; claims: AnalysisClaim[] }, packageId: string) {
    await db.transaction("rw", [db.analysisRuns, db.claims, db.evidencePackages], async () => {
      await db.analysisRuns.bulkPut(result.runs);
      await db.claims.bulkPut(result.claims);
      const item = await db.evidencePackages.get(packageId);
      if (item) await db.evidencePackages.update(packageId, { status: "待对照审核", updatedAt: stamp(), version: item.version + 1 });
    });
    await this.addAudit("system", "生成模拟AI对照", "EvidencePackage", packageId, "AI仅基于教师已提交证据生成事实、解释和假设草稿。" );
  }

  async simulateVideoAnalysis(mediaId: string) {
    const media = await db.mediaEvidence.get(mediaId);
    if (!media || media.type !== "视频") throw new Error("未找到可分析的视频片段");
    const subject = await db.observationSubjects.where("evidencePackageId").equals(media.evidencePackageId).first();
    const sentences = (subject?.teacherObservation || "教师已选择关键视频片段，需回看确认幼儿的动作、原话和事件顺序。")
      .split("。").map((item) => item.trim()).filter(Boolean);
    const updated: MediaEvidence = {
      ...media, updatedAt: stamp(), version: media.version + 1, simulatedAnalysisStatus: "已分析",
      transcript: subject?.childQuote || "模拟转写：请教师对照原视频确认并编辑幼儿原话。",
      events: [
        { id: makeId("event"), startSecond: 3, endSecond: 16, category: "关键行动", objectiveDescription: `${sentences[0] || "幼儿开始操作材料"}。`, possibleMeaning: "仅为事件定位，不直接构成发展判断。", confidence: 0.88 },
        { id: makeId("event"), startSecond: 17, endSecond: 36, category: "策略变化", objectiveDescription: `${sentences[1] || "幼儿继续观察并调整行动"}。`, possibleMeaning: "可能体现策略调整，需要教师结合前后情境确认。", confidence: 0.78 },
      ],
    };
    await new Promise((resolve) => setTimeout(resolve, 550));
    await db.mediaEvidence.put(updated);
    await this.addAudit("system", "完成模拟视频行为分析", "MediaEvidence", mediaId, "生成可编辑转写和时间轴事件，等待教师回看确认。" );
  }

  async reviewClaim(id: string, reviewStatus: AnalysisClaim["reviewStatus"], teacherRevision?: string) {
    await db.claims.update(id, { reviewStatus, teacherRevision });
    await this.addAudit("teacher", "审核AI结论", "AnalysisClaim", id, `${reviewStatus}${teacherRevision ? "，并保存教师修订" : ""}。`);
  }

  async integratePackage(packageId: string) {
    const item = await db.evidencePackages.get(packageId);
    if (!item) return;
    const runs = await db.analysisRuns.where("evidencePackageId").equals(packageId).toArray();
    await db.transaction("rw", [db.evidencePackages, db.analysisRuns], async () => {
      await db.evidencePackages.update(packageId, { status: "已整合", updatedAt: stamp(), version: item.version + 1 });
      await db.analysisRuns.bulkPut(runs.map((run) => ({ ...run, status: "教师已整合" as const, updatedAt: stamp(), version: run.version + 1 })));
    });
    await this.addAudit("teacher", "完成教师对照整合", "EvidencePackage", packageId, "审核后的判断可进入成长轨迹、报告和课程线索。" );
  }

  async saveSupportAction(action: SupportAction) {
    await db.supportActions.put({ ...action, updatedAt: stamp(), version: action.version + 1 });
    await this.addAudit("teacher", "更新支持行动", "SupportAction", action.id, `状态流转为“${action.status}”。`);
  }

  async saveQualityReview(review: ObservationQualityReview) {
    await db.qualityReviews.put({ ...review, updatedAt: stamp(), version: review.version + 1 });
    await this.addAudit("research_admin", review.status === "通过" ? "通过观察质量审核" : review.status === "退回修改" ? "退回观察记录修改" : "保存观察质量审核", "ObservationQualityReview", review.id, review.comment);
  }

  async requestExport(request: ExportRequest) {
    await db.exportRequests.put(request);
    await this.addAudit("teacher", "提交导出申请", "ExportRequest", request.id, `${request.exportType}，用途：${request.purpose}`);
  }

  async decideExport(request: ExportRequest, status: "已通过" | "已拒绝", note: string) {
    const updated = { ...request, status, decisionNote: note, decidedBy: "周教研员", decidedAt: stamp(), updatedAt: stamp(), version: request.version + 1 };
    await db.exportRequests.put(updated);
    await this.addAudit("research_admin", status === "已通过" ? "通过导出审批" : "拒绝导出审批", "ExportRequest", request.id, note);
  }

  async toggleAccount(account: UserAccount, reason: string) {
    const disabling = account.status === "启用";
    const updated: UserAccount = { ...account, status: disabling ? "已停用" : "启用", disabledAt: disabling ? stamp() : undefined, disabledReason: disabling ? reason : undefined, updatedAt: stamp(), version: account.version + 1 };
    await db.userAccounts.put(updated);
    await this.addAudit("research_admin", disabling ? "停用账号" : "重新启用账号", "UserAccount", account.id, disabling ? reason : "恢复演示账号访问权限。" );
  }

  async saveResearchActivity(activity: ResearchActivity) {
    await db.researchActivities.put({ ...activity, updatedAt: stamp(), version: activity.version + 1 });
    await this.addAudit("research_admin", "更新教研活动", "ResearchActivity", activity.id, `活动状态为“${activity.status}”。`);
  }

  async saveGamePlan(plan: GamePlan) { await db.gamePlans.put({ ...plan, updatedAt: stamp(), version: plan.version + 1 }); }
  async saveCurriculumPlan(plan: CurriculumPlan) {
    await db.curriculumPlans.put({ ...plan, updatedAt: stamp(), version: plan.version + 1, planVersion: plan.planVersion + 1 });
    await this.addAudit("research_admin", "更新课程草案", "CurriculumPlan", plan.id, `课程状态更新为“${plan.status}”。`);
  }
  async saveIndividualReport(report: IndividualReport) { await db.individualReports.put({ ...report, updatedAt: stamp(), version: report.version + 1 }); }

  async importChildren(rows: ChildImportRow[]) {
    const existing = await db.children.toArray();
    const duplicates = rows.filter((row) => existing.some((child) => child.name === row.name && child.birthMonth === row.birthMonth));
    if (duplicates.length) throw new Error(`发现重复幼儿：${duplicates.map((item) => item.name).join("、")}`);
    const now = stamp();
    const created: Child[] = rows.map((row, index) => ({
      id: makeId("child"), tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1,
      name: row.name, alias: row.alias || row.name, initials: (row.alias || row.name).slice(0, 1), classroomId: "class-1", classroomName: row.classroomName,
      grade: row.grade, birthMonth: row.birthMonth, consentStatus: row.consentStatus, color: ["#E6A77B", "#76A98F", "#72A7C2"][index % 3], interests: ["待持续观察"], lastObservedAt: "", observationCount: 0,
    }));
    await db.children.bulkAdd(created);
    await this.addAudit("teacher", "批量导入幼儿", "Child", created[0]?.id ?? "none", `导入 ${created.length} 名幼儿。`);
  }

  async exportJson() {
    const snapshot = await this.snapshot();
    return JSON.stringify({ ...snapshot, mediaEvidence: snapshot.mediaEvidence.map(({ blob: _blob, ...item }) => item), dataVersion: DEMO_DATA_VERSION, exportedAt: stamp(), notice: "童迹3.0本地演示数据，不含媒体Blob。" }, null, 2);
  }
}

export class LocalMediaStorage implements MediaStorage {
  async toRecord(file: File, evidencePackageId: string, index = 0): Promise<MediaEvidence> {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    const limit = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!isVideo && !isImage && !file.name.match(/\.(doc|docx|pdf)$/i)) throw new Error("仅支持图片、视频和观察表文档");
    if (file.size > limit) throw new Error(isVideo ? "视频片段不能超过100MB" : "图片或文档不能超过10MB");
    const now = stamp();
    return { id: makeId("media"), tenantId: TENANT_ID, createdAt: now, updatedAt: now, createdBy: "user-teacher", version: 1, evidencePackageId, type: isVideo ? "视频" : isImage ? "照片" : "观察表文档", name: file.name, mimeType: file.type, size: file.size, blob: file, simulatedAnalysisStatus: isVideo ? "待分析" : undefined };
  }

  async save(file: File, evidencePackageId: string) {
    const count = await db.mediaEvidence.where("evidencePackageId").equals(evidencePackageId).count();
    if (count >= 5) throw new Error("单次证据包最多包含5项媒体文件");
    const record = await this.toRecord(file, evidencePackageId, count);
    await db.mediaEvidence.add(record);
    return record;
  }

  async get(id: string) { return (await db.mediaEvidence.get(id))?.blob; }
  async remove(id: string) { await db.mediaEvidence.delete(id); }
}

export class DemoAuthProvider implements AuthProvider {
  async getSession(role: Role): Promise<AuthSession> {
    const actor = role === "teacher" ? ["user-teacher", "陈老师"] : role === "research_admin" ? ["user-research", "周教研员"] : ["user-principal", "沈园长"];
    return { role, actorId: actor[0], actorName: actor[1] };
  }
}

export const localRepository = new IndexedDbRepository();
export const localMediaStorage = new LocalMediaStorage();
export const demoAuthProvider = new DemoAuthProvider();
