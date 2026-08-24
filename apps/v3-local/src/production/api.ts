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
  RemoteQualityReview,
  RemoteExportRequest,
  RemoteResearchActivity,
  RemoteResearchEntry,
  RemoteSupportAction,
  RemoteGrowthResult,
  RemotePeriodReport,
  RemoteCurriculumClue,
  RemoteUser,
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

const body = (value: unknown) => JSON.stringify(value);

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
  observations: () =>
    request<{ items: RemoteObservation[] }>("/api/observations"),
  observation: (id: string) =>
    request<{
      item: RemoteObservation;
      evidence: RemoteEvidence[];
      analyses: RemoteAnalysis[];
    }>(`/api/observations/${id}`),
  createObservation: (value: Record<string, unknown>) =>
    request<{ item: RemoteObservation }>("/api/observations", {
      method: "POST",
      body: body(value),
    }),
  analyze: (id: string) =>
    request<{ item: RemoteAnalysis; aiNotice: string; simulationNotice: string }>(
      `/api/observations/${id}/analyze`,
      { method: "POST" },
    ),
  decideAnalysis: (
    id: string,
    decision: "adopted" | "abandoned",
    note?: string,
  ) =>
    request<{ item: RemoteAnalysis }>(`/api/analyses/${id}/decision`, {
      method: "POST",
      body: body({ decision, note }),
    }),
  evidenceTicket: (observationId: string, file: File) =>
    request<{
      evidenceId: string;
      path: string;
      token: string;
      bucket: string;
      supabaseUrl: string;
      publishableKey: string;
    }>(`/api/observations/${observationId}/evidence-ticket`, {
      method: "POST",
      body: body({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    }),
  completeEvidence: (id: string) =>
    request<{ item: RemoteEvidence }>(`/api/evidence/${id}/complete`, {
      method: "POST",
    }),
  async uploadEvidence(observationId: string, file: File) {
    const ticket = await this.evidenceTicket(observationId, file);
    return request<{ item: RemoteEvidence }>(
      `/api/evidence/${ticket.evidenceId}/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      },
    );
  },
  knowledge: (params = "") =>
    request<{ items: RemoteKnowledgeCard[]; version: string }>(
      `/api/knowledge${params ? `?${params}` : ""}`,
    ),
  templates: () =>
    request<{ items: RemoteObservationTemplate[] }>(
      "/api/observation-templates",
    ),
  accounts: () => request<{ items: RemoteAccount[] }>("/api/accounts"),
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
  qualityReviews: () =>
    request<{ items: RemoteQualityQueueItem[] }>("/api/quality-reviews"),
  saveQualityReview: (value: Record<string, unknown>) =>
    request<{ item: RemoteQualityReview }>("/api/quality-reviews", {
      method: "POST",
      body: body(value),
    }),
  exportRequests: () =>
    request<{ items: RemoteExportRequest[] }>("/api/export-requests"),
  createExportRequest: (value: Record<string, unknown>) =>
    request<{ item: RemoteExportRequest }>("/api/export-requests", {
      method: "POST",
      body: body(value),
    }),
  decideExportRequest: (
    id: string,
    decision: "approved" | "rejected",
    note: string,
  ) =>
    request<{ item: RemoteExportRequest }>(
      `/api/export-requests/${id}/decision`,
      { method: "PATCH", body: body({ decision, note }) },
    ),
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
};
