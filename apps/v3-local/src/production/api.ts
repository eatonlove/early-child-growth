import type {
  RemoteAccount,
  RemoteAIModelConfig,
  RemoteAICredentialConfig,
  RemoteAIPrompt,
  RemoteAIPromptKey,
  RemoteAnalysisFramework,
  RemoteAnalysisJob,
  RemoteAnalysisSubjectResult,
  AnalysisClaimDecision,
  RemoteAnalysis,
  RemoteAnalysisClaimReview,
  RemoteChild,
  RemoteClassroom,
  RemoteEvidence,
  RemoteKnowledgeCard,
  RemoteObservation,
  RemoteObservationImport,
  RemoteObservationSubject,
  RemoteObservationTemplate,
  RemoteObserver,
  RemoteResearchActivity,
  RemoteResearchEntry,
  RemoteSupportAction,
  RemoteGrowthResult,
  RemotePeriodReport,
  RemoteCurriculumClue,
  RemoteCurriculumTemplate,
  RemoteCurriculumWorkspace,
  RemoteCurriculumResourcePackage,
  RemoteCurriculumResourceAsset,
  RemoteProfessionalMemory,
  RemoteResponsePlan,
  RemoteUser,
  ResourceCategory, ResourcePreview, RemoteResourceCategoryAnalysis,
} from "./types";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export class RemoteApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const isUnauthenticatedError = (reason: unknown) =>
  reason instanceof RemoteApiError && [401, 403].includes(reason.status);

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return request<T>(path, init, false);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RemoteApiError(
      response.status,
      payload.code || "REQUEST_FAILED",
      payload.message || "请求失败",
      payload.fields,
    );
  return payload as T;
}

async function download(path: string, fileName: string) {
  const response = await fetch(`${baseUrl}${path}`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new RemoteApiError(response.status, payload.code || "DOWNLOAD_FAILED", payload.message || "文件下载失败");
  }
  const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const resolvedFileName = encodedName ? decodeURIComponent(encodedName) : fileName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resolvedFileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const body = (value: unknown) => JSON.stringify(value);

async function uploadFile<T>(path:string,file:File,contentType:string,onProgress?:(percent:number)=>void):Promise<T> {
  const upload=()=>new Promise<T>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',`${baseUrl}${path}`);xhr.withCredentials=true;xhr.timeout=15*60*1000;
    xhr.setRequestHeader('Content-Type',contentType);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
    xhr.onerror=()=>reject(new RemoteApiError(0,'UPLOAD_NETWORK_ERROR',`${file.name}：上传连接中断，请重试当前文件`));
    xhr.ontimeout=()=>reject(new RemoteApiError(0,'UPLOAD_TIMEOUT',`${file.name}：上传或处理超时，请先查看记录状态后重试`));
    xhr.onabort=()=>reject(new RemoteApiError(0,'UPLOAD_ABORTED',`${file.name}：上传已取消`));
    xhr.onload=()=>{
      let payload:Record<string,unknown>={};
      try{const parsed=JSON.parse(xhr.responseText);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))payload=parsed;}catch{ /* Nginx can return a non-JSON error page. */ }
      if(xhr.status>=200&&xhr.status<300)resolve(payload as T);
      else reject(new RemoteApiError(xhr.status,typeof payload.code==='string'?payload.code:'UPLOAD_FAILED',typeof payload.message==='string'?payload.message:xhr.status===413?'文件超过允许的大小，请缩短视频片段或减小文件':'文件上传失败，请重试',payload.fields as Record<string,string[]>|undefined));
    };
    xhr.send(file);
  });
  try{return await upload();}catch(reason){
    if(reason instanceof RemoteApiError&&reason.status===401){
      const refreshed=await fetch(`${baseUrl}/api/auth/refresh`,{method:'POST',credentials:'include'});
      if(refreshed.ok)return upload();
    }
    throw reason;
  }
}

function inferredFileMime(file:File) {
  return file.type||({doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',mov:'video/quicktime'} as Record<string,string>)[file.name.toLowerCase().split('.').pop()??'']||'application/octet-stream';
}

export const remoteApi = {
  login: (username: string, password: string) =>
    request<{ user: RemoteUser }>(
      "/api/auth/login",
      { method: "POST", body: body({ username, password }) },
      false,
    ),
  logout: () =>
    request<{ ok: true }>("/api/auth/logout", { method: "POST" }, false),
  me: () => request<{ user: RemoteUser }>("/api/me"),
  dashboard: () =>
    request<{
      counts: {
        classrooms: number;
        children: number;
        observations: number;
        pendingAnalyses: number;
      };
      role: string;
    }>("/api/dashboard"),
  classrooms: () => request<{ items: RemoteClassroom[] }>("/api/classrooms"),
  observers: (classroomId: string) =>
    request<{ items: RemoteObserver[] }>(`/api/observers?classroomId=${encodeURIComponent(classroomId)}`),
  createClassroom: (value: {
    name: string;
    grade: string;
    academicYear: string;
    semester: string;
  }) =>
    request<{ item: RemoteClassroom }>("/api/classrooms", {
      method: "POST",
      body: body(value),
    }),
  updateClassroom: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteClassroom }>(`/api/classrooms/${id}`, {
      method: "PATCH",
      body: body(value),
    }),
  children: (classroomId?: string) =>
    request<{ items: RemoteChild[] }>(
      `/api/children${classroomId ? `?classroomId=${classroomId}` : ""}`,
    ),
  createChild: (value: Record<string, unknown>) =>
    request<{ item: RemoteChild }>("/api/children", {
      method: "POST",
      body: body(value),
    }),
  updateChild: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteChild }>(`/api/children/${id}`, {
      method: "PATCH",
      body: body(value),
    }),
  deleteChild: (id: string) => request<void>(`/api/children/${id}`, { method: "DELETE" }),
  downloadChildImportTemplate: () => download("/api/children/import-template", "同迹幼儿批量导入模板.csv"),
  importChildren: (value: { classroomId: string; rows: Array<Record<string, unknown>> }) =>
    request<{ items: RemoteChild[]; importedCount: number }>("/api/children/import", {
      method: "POST",
      body: body(value),
    }),
  observations: (filters: { classroomId?: string; academicYear?: string; semester?: string; year?: number; month?: number } = {}) => {
    const params = new URLSearchParams();
    if (filters.classroomId) params.set("classroomId", filters.classroomId);
    if (filters.academicYear) params.set("academicYear", filters.academicYear);
    if (filters.semester) params.set("semester", filters.semester);
    if (filters.year) params.set("year", String(filters.year));
    if (filters.month) params.set("month", String(filters.month));
    return request<{ items: RemoteObservation[] }>(`/api/observations${params.size ? `?${params}` : ""}`);
  },
  downloadObservationArchive: (filters: { classroomId: string; year?: number; month?: number }) => {
    const params = new URLSearchParams({ classroomId: filters.classroomId });
    if (filters.year) params.set("year", String(filters.year));
    if (filters.month) params.set("month", String(filters.month));
    return download(`/api/observation-archive/document?${params}`, "同迹班级观察档案.docx");
  },
  observation: (id: string) =>
    request<{
      item: RemoteObservation;
      canDelete: boolean;
      canSupplement: boolean;
      analysisSubjectResults: RemoteAnalysisSubjectResult[];
      evidence: RemoteEvidence[];
      analyses: RemoteAnalysis[];
      subjects: RemoteObservationSubject[];
      responsePlans: RemoteResponsePlan[];
      observers: RemoteObserver[];
      analysisJob: RemoteAnalysisJob | null;
    }>(`/api/observations/${id}`),
  deleteObservation: (id:string) => request<{ok:true;warning:string|null}>(`/api/observations/${id}`,{method:'DELETE'}),
  createObservation: (value: Record<string, unknown>) =>
    request<{ item: RemoteObservation }>("/api/observations", {
      method: "POST",
      body: body(value),
    }),
  supplementObservationSubject: (id: string, childId: string, value: {additionalObservation: string; contextualFeature: string; evidenceAnchors: string[]}) =>
    request<{item: RemoteObservationSubject}>(`/api/observations/${id}/subjects/${childId}/supplement`, {method: 'PATCH', body: body(value)}),
  analyze: (id: string, childIds?: string[]) =>
    request<{ item: RemoteAnalysisJob }>(
      `/api/observations/${id}/analyze`,
      { method: "POST", ...(childIds ? {body: body({childIds})} : {}) },
    ),
  analysisJob: (id: string) =>
    request<{ item: RemoteAnalysisJob }>(`/api/analysis-jobs/${id}`),
  decideAnalysis: (
    id: string,
    decision: "adopted" | "abandoned",
    note?: string,
  ) =>
    request<{ item: RemoteAnalysis }>(`/api/analyses/${id}/decision`, {
      method: "POST",
      body: body({ decision, note }),
    }),
  reviewAnalysisClaim: (
    analysisId: string,
    claimKey: string,
    value: { decision: Exclude<AnalysisClaimDecision, "pending">; content?: string; note?: string },
  ) => request<{ item: RemoteAnalysisClaimReview }>(
    `/api/analyses/${analysisId}/claims/${encodeURIComponent(claimKey)}`,
    { method: "PATCH", body: body(value) },
  ),
  finalizeAnalysis: (id: string, note?: string) =>
    request<{ item: RemoteAnalysis }>(`/api/analyses/${id}/finalize`, {
      method: "POST",
      body: body({ note }),
    }),
  reviewAnalysisSection: (analysisId: string, section: string, value: Record<string, unknown>) =>
    request<{ items: RemoteAnalysisClaimReview[] }>(`/api/analyses/${analysisId}/sections/${section}`, { method: "PATCH", body: body(value) }),
  reviseAnalysis: (analysisId: string, feedback: Array<Record<string, unknown>>) =>
    request<{ item: RemoteAnalysis; aiNotice: string }>(`/api/analyses/${analysisId}/revise`, { method: "POST", body: body({ feedback }) }),
  responsePlans: (observationId: string, childId?: string) => {
    const params = new URLSearchParams({ observationId });
    if (childId) params.set("childId", childId);
    return request<{ items: RemoteResponsePlan[] }>(`/api/response-plans?${params}`);
  },
  selectResponsePlan: (id: string) => request<{ item: RemoteResponsePlan }>(`/api/response-plans/${id}/select`, { method: "POST" }),
  combineResponsePlans: (value: { title: string; activityPlanId: string; materialPlanId: string; experiencePlanId: string }) =>
    request<{ item: RemoteResponsePlan }>("/api/response-plans/combine", { method: "POST", body: body(value) }),
  downloadObservationTemplate: () => download("/api/observation-template/document", "同迹游戏观察记录表模板.docx"),
  async importObservationDocument(classroomId: string, file: File, onProgress?:(percent:number)=>void) {
    if(!file.size||file.size>10*1024*1024)throw new RemoteApiError(422,'OBSERVATION_DOCUMENT_TOO_LARGE','观察表文件不能为空，且不能超过10MB');
    const created = await request<{ item: RemoteObservationImport }>("/api/observation-imports", {
      method: "POST",
      body: body({ classroomId, fileName: file.name, mimeType: inferredFileMime(file), sizeBytes: file.size }),
    });
    return uploadFile<{item:RemoteObservationImport;aiNotice:string}>(`/api/observation-imports/${created.item.id}/upload`,file,'application/octet-stream',onProgress);
  },
  observationImports: (classroomId?: string) =>
    request<{ items: RemoteObservationImport[] }>(`/api/observation-imports${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`),
  createObservationDocument: (id: string, variant: "teacher" | "professional") =>
    request<{ documentExport: { id: string } }>(`/api/observations/${id}/document-exports`, { method: "POST", body: body({ variant }) }),
  documentExportDownload: (id: string) => download(`/api/document-exports/${id}/download`, "同迹文档.docx"),
  evidenceTicket: (observationId: string, file: File) =>
    request<{
      evidenceId: string;
      uploadPath: string;
    }>(`/api/observations/${observationId}/evidence-ticket`, {
      method: "POST",
      body: body({
        fileName: file.name,
        mimeType: inferredFileMime(file),
        sizeBytes: file.size,
      }),
    }),
  completeEvidence: (id: string) =>
    request<{ item: RemoteEvidence }>(`/api/evidence/${id}/complete`, {
      method: "POST",
    }),
  evidenceDownload: (id: string) =>
    request<{ url: string; expiresIn: number }>(`/api/evidence/${id}/download`),
  async uploadEvidence(observationId: string, file: File, onProgress?:(percent:number)=>void) {
    const limit=inferredFileMime(file).startsWith('video/')?100*1024*1024:10*1024*1024;
    if(!file.size||file.size>limit)throw new RemoteApiError(422,'MEDIA_TOO_LARGE',`${file.name}：文件不能为空，视频最多100MB，图片或文档最多10MB`);
    const ticket = await this.evidenceTicket(observationId, file);
    return uploadFile<{item:RemoteEvidence}>(ticket.uploadPath,file,'application/x-tongji-evidence-stream',onProgress);
  },
  knowledge: (params = "") =>
    request<{ items: RemoteKnowledgeCard[]; version: string }>(
      `/api/knowledge${params ? `?${params}` : ""}`,
    ),
  templates: (filters: { grade?: string; scene?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.grade) params.set("grade", filters.grade);
    if (filters.scene) params.set("scene", filters.scene);
    return request<{
      items: RemoteObservationTemplate[];
      recommendation: { grade: string | null; scene: string | null; matched: boolean };
    }>(`/api/observation-templates${params.size ? `?${params}` : ""}`);
  },
  accounts: () => request<{ items: RemoteAccount[] }>("/api/accounts"),
  updateAccountDisplayName: (userId:string,displayName:string) =>
    request<{item:RemoteAccount}>(`/api/accounts/${userId}/display-name`,{method:'PATCH',body:body({displayName})}),
  createAccount: (value: Record<string, unknown>) =>
    request<{ item: RemoteAccount }>("/api/accounts", {
      method: "POST",
      body: body(value),
    }),
  setAccountStatus: (
    userId: string,
    status: "active" | "disabled",
    reason?: string,
  ) =>
    request<{ status: string }>(`/api/accounts/${userId}/status`, {
      method: "PATCH",
      body: body({ status, reason }),
    }),
  resetAccountPassword: (userId: string, password: string) =>
    request<{ ok: true }>(`/api/accounts/${userId}/password`, {
      method: "PATCH",
      body: body({ password }),
    }),
  updateAccountClassrooms: (userId:string,classroomIds:string[]) =>
    request<{item:RemoteAccount}>(`/api/accounts/${userId}/classrooms`,{
      method:'PATCH',body:body({classroomIds}),
    }),
  aiModelConfig: () =>
    request<{ item: RemoteAIModelConfig }>("/api/ai-model-config"),
  aiCredentialConfig: () =>
    request<{ item: RemoteAICredentialConfig }>("/api/ai-credential-config"),
  updateAICredentialConfig: (value: { profile: "YT" | "YQY"; expectedRevision: number }) =>
    request<{ item: RemoteAICredentialConfig }>("/api/ai-credential-config", {
      method: "PUT", body: body(value),
    }),
  updateAIModelConfig: (value: { model: string; expectedRevision: number }) =>
    request<{ item: RemoteAIModelConfig }>("/api/ai-model-config", {
      method: "PUT",
      body: body(value),
    }),
  aiPrompts: () =>
    request<{ immutableSafetyPrompt: string; items: RemoteAIPrompt[] }>("/api/ai-prompts"),
  updateAIPrompt: (
    key: RemoteAIPromptKey,
    value: { systemPrompt: string; expectedRevision: number; changeNote: string },
  ) =>
    request<{ item: RemoteAIPrompt }>(`/api/ai-prompts/${key}`, {
      method: "PUT",
      body: body(value),
    }),
  resetAIPrompt: (key: RemoteAIPromptKey, expectedRevision: number) =>
    request<{ item: RemoteAIPrompt }>(`/api/ai-prompts/${key}/reset`, {
      method: "POST",
      body: body({ expectedRevision }),
    }),
  researchActivities: () =>
    request<{ items: RemoteResearchActivity[] }>("/api/research-activities"),
  createResearchActivity: (value: Record<string, unknown>) =>
    request<{ item: RemoteResearchActivity }>("/api/research-activities", {
      method: "POST",
      body: body(value),
    }),
  updateResearchActivity: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteResearchActivity }>(`/api/research-activities/${id}`, {
      method: "PATCH",
      body: body(value),
    }),
  saveResearchEntry: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteResearchEntry }>(
      `/api/research-activities/${id}/entries`,
      { method: "POST", body: body(value) },
    ),
  supportActions: (childId?: string) =>
    request<{ items: RemoteSupportAction[] }>(
      `/api/support-actions${childId ? `?childId=${childId}` : ""}`,
    ),
  updateSupportAction: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteSupportAction }>(`/api/support-actions/${id}`, {
      method: "PATCH",
      body: body(value),
    }),
  growth: (childId: string) =>
    request<RemoteGrowthResult>(`/api/children/${childId}/growth`),
  reports: () => request<{ items: RemotePeriodReport[] }>("/api/reports"),
  generateReport: (value: Record<string, unknown>) =>
    request<{ item: RemotePeriodReport; aiNotice: string }>("/api/reports/generate", {
      method: "POST",
      body: body(value),
    }),
  updateReport: (id: string, content: Record<string, unknown>) =>
    request<{ item: RemotePeriodReport }>(`/api/reports/${id}`, { method: "PATCH", body: body({ content }) }),
  reviseReport: (id: string, instruction: string) =>
    request<{ item: RemotePeriodReport; aiNotice: string }>(`/api/reports/${id}/revise`, { method: "POST", body: body({ instruction }) }),
  deleteReport: (id: string) => request<void>(`/api/reports/${id}`, { method: "DELETE" }),
  updateReportStatus: (id: string, status: string) =>
    request<{ item: RemotePeriodReport }>(`/api/reports/${id}/status`, {
      method: "PATCH",
      body: body({ status }),
    }),
  curriculumClues: () =>
    request<{ items: RemoteCurriculumClue[] }>("/api/curriculum-clues"),
  scanCurriculum: (classroomId: string) =>
    request<{ items: RemoteCurriculumClue[] }>("/api/curriculum-clues/scan", {
      method: "POST",
      body: body({ classroomId }),
    }),
  updateCurriculumClue: (id: string, value: Record<string, unknown>) =>
    request<{ item: RemoteCurriculumClue }>(`/api/curriculum-clues/${id}`, {
      method: "PATCH",
      body: body(value),
    }),
  deleteCurriculumClue: (id: string) => request<void>(`/api/curriculum-clues/${id}`, { method: "DELETE" }),
  curriculumTemplates: () => request<{ items: RemoteCurriculumTemplate[] }>("/api/curriculum-templates"),
  createCurriculumTemplate: (value: { code: string; name: string; description: string; structure: Record<string, unknown>; isDefault: boolean }) =>
    request<{ item: RemoteCurriculumTemplate }>("/api/curriculum-templates", { method: "POST", body: body(value) }),
  professionalMemories: (status?: "pending" | "active" | "disabled") =>
    request<{ items: RemoteProfessionalMemory[] }>(`/api/professional-memories${status ? `?status=${status}` : ""}`),
  updateProfessionalMemory: (id: string, value: { status: "active" | "disabled"; qualityScore?: number }) =>
    request<{ item: RemoteProfessionalMemory }>(`/api/professional-memories/${id}`, { method: "PATCH", body: body(value) }),
  curriculumResourcePackages: () => request<{ items: RemoteCurriculumResourcePackage[] }>("/api/curriculum-resource-packages"),
  createCurriculumResourcePackage: (value: { title: string; summary?: string; activityOrigin?: string; category?: ResourceCategory; applicableGrades: string[]; themes: string[] }) =>
    request<{ item: RemoteCurriculumResourcePackage }>("/api/curriculum-resource-packages", { method: "POST", body: body(value) }),
  uploadCurriculumResourceAsset: async (packageId: string, assetType: RemoteCurriculumResourceAsset["asset_type"], file: File, onProgress?: (percent:number) => void) => {
    if (file.size < 1 || file.size > 500 * 1024 * 1024) throw new RemoteApiError(422, 'RESOURCE_FILE_TOO_LARGE', `${file.name}：单文件不能超过500MB，且不能为空`);
    const extension = file.name.toLowerCase().split(".").pop();
    const inferredMime = ({ doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } as Record<string, string>)[extension ?? ""];
    const params = new URLSearchParams({ assetType, fileName: file.name, mimeType: file.type || inferredMime || "application/octet-stream", sizeBytes:String(file.size) });
    const path = `/api/curriculum-resource-packages/${packageId}/assets?${params}`;
    const upload = () => new Promise<{item:RemoteCurriculumResourceAsset}>((resolve,reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST',`${baseUrl}${path}`); xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type','application/x-tongji-resource-stream');
      xhr.upload.onprogress = (event) => { if(event.lengthComputable) onProgress?.(Math.round(event.loaded/event.total*100)); };
      xhr.onerror = () => reject(new RemoteApiError(0,'RESOURCE_NETWORK_ERROR',`${file.name}：网络中断，已上传文件保留，请继续上传`));
      xhr.onload = () => {
        let payload:Record<string,any> = {};
        try { payload = JSON.parse(xhr.responseText); } catch { /* The proxy can return a non-JSON error page. */ }
        if(xhr.status >= 200 && xhr.status < 300) resolve(payload as {item:RemoteCurriculumResourceAsset});
        else reject(new RemoteApiError(xhr.status,payload.code || 'RESOURCE_UPLOAD_FAILED',`${file.name}：${xhr.status === 413 ? '文件超过500MB上限' : payload.message || '上传失败，请重试当前文件'}`));
      };
      xhr.send(file);
    });
    try { return await upload(); } catch(reason) {
      if(reason instanceof RemoteApiError && reason.status === 401) {
        const refreshed = await fetch(`${baseUrl}/api/auth/refresh`,{method:'POST',credentials:'include'});
        if(refreshed.ok) return upload();
      }
      throw reason;
    }
  },
  updateCurriculumResourcePackage: (id:string,value:{title?:string;activityOrigin?:string;category?:ResourceCategory | null;applicableGrades?:string[];themes?:string[]}) => request<{item:RemoteCurriculumResourcePackage}>(`/api/curriculum-resource-packages/${id}`,{method:'PATCH',body:body(value)}),
  deleteCurriculumResourcePackage: (id:string) => request<void>(`/api/curriculum-resource-packages/${id}`,{method:'DELETE'}),
  previewCurriculumResourceAsset: (id:string) => request<ResourcePreview>(`/api/curriculum-resource-assets/${id}/preview`),
  resourceCategoryAnalysis: (category:ResourceCategory) => request<{item:RemoteResourceCategoryAnalysis | null}>(`/api/resource-categories/${category}/analysis`),
  analyzeResourceCategory: (category:ResourceCategory) => request<{item:RemoteResourceCategoryAnalysis}>(`/api/resource-categories/${category}/analyze`,{method:'POST'}),
  submitCurriculumResourcePackage: (id: string) => request<{ item: RemoteCurriculumResourcePackage }>(`/api/curriculum-resource-packages/${id}/submit`, { method: "POST" }),
  reviewCurriculumResourcePackage: (id: string, value: { decision: "active" | "rejected"; comment?: string }) => request<{ item: RemoteCurriculumResourcePackage }>(`/api/curriculum-resource-packages/${id}/review`, { method: "PATCH", body: body(value) }),
  downloadCurriculumResourceAsset: (id: string, fileName: string) => download(`/api/curriculum-resource-assets/${id}/download`, fileName),
  analysisFrameworks: () => request<{ items: RemoteAnalysisFramework[] }>("/api/analysis-frameworks"),
  createAnalysisFramework: (value: { frameworkType: RemoteAnalysisFramework["framework_type"]; code: string; name: string; description: string; dimensions: RemoteAnalysisFramework["dimensions"]; isDefault: boolean }) =>
    request<{ item: RemoteAnalysisFramework }>("/api/analysis-frameworks", { method: "POST", body: body(value) }),
  createCurriculumFromEvidence: (value: { classroomId: string; observationIds: string[]; theme?: string }) =>
    request<{ item: RemoteCurriculumClue }>("/api/curriculum-clues/from-evidence", { method: "POST", body: body(value) }),
  curriculumWorkspace: (id: string) => request<RemoteCurriculumWorkspace>(`/api/curriculum-clues/${id}/workspace`),
  generateCurriculumOptions: (id: string) => request<{ items: RemoteCurriculumWorkspace["options"]; aiNotice: string }>(`/api/curriculum-clues/${id}/activity-options`, { method: "POST" }),
  selectCurriculumOptions: (id: string, selectedOptionIds: string[]) => request<{ items: RemoteCurriculumWorkspace["options"] }>(`/api/curriculum-clues/${id}/activity-options`, { method: "PATCH", body: body({ selectedOptionIds }) }),
  generateCurriculumPlan: (id: string, value: { implementationPeriod: string; templateVersionId?: string }) => request<{ item: RemoteCurriculumWorkspace["plans"][number]; aiNotice: string }>(`/api/curriculum-clues/${id}/plan`, { method: "POST", body: body(value) }),
  createCurriculumCycle: (planId: string, value: Record<string, unknown>) => request<{ item: RemoteCurriculumWorkspace["cycles"][number] }>(`/api/curriculum-plans/${planId}/cycles`, { method: "POST", body: body(value) }),
  createCurriculumDocument: (planId: string) => request<{ documentExport: { id: string } }>(`/api/curriculum-plans/${planId}/document-exports`, { method: "POST", body: body({}) }),
};
