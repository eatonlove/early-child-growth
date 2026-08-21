import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, audit, authenticate } from "../http.js";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nextSupportStatus: Record<string, string[]> = {
  planned: ["implemented"],
  implemented: ["follow_up"],
  follow_up: ["verified"],
  verified: ["closed"],
  closed: [],
};

function mostFrequent(values: string[], limit = 4) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

export async function outcomeRoutes(app: FastifyInstance) {
  app.get("/api/support-actions", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ childId: uuid.optional(), classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("support_actions").select("*").order("created_at", { ascending: false });
    if (query.childId) builder = builder.eq("child_id", query.childId);
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "SUPPORT_LIST_FAILED", "应答行动读取失败");
    return { items: data ?? [] };
  });

  app.patch("/api/support-actions/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      status: z.enum(["implemented", "follow_up", "verified", "closed"]),
      plannedFor: date.optional(),
      childResponse: z.string().trim().max(3000).optional(),
      effectiveness: z.enum(["supported", "insufficient", "continue"]).optional(),
    }).parse(request.body);
    const { data: current } = await auth.data.from("support_actions").select("*").eq("id", id).maybeSingle();
    if (!current) throw new ApiError(404, "SUPPORT_NOT_FOUND", "应答行动不存在或无权访问");
    if (!(nextSupportStatus[current.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "INVALID_SUPPORT_TRANSITION", `不能从“${current.status}”直接变更为“${input.status}”`);
    }
    if (input.status === "verified" && (!input.childResponse || !input.effectiveness)) {
      throw new ApiError(422, "FOLLOW_UP_EVIDENCE_REQUIRED", "完成复察验证时必须记录幼儿反应和效果判断");
    }
    const { data, error } = await auth.data.from("support_actions").update({
      status: input.status,
      ...(input.plannedFor !== undefined && { planned_for: input.plannedFor }),
      ...(input.childResponse !== undefined && { child_response: input.childResponse }),
      ...(input.effectiveness !== undefined && { effectiveness: input.effectiveness }),
      ...(input.status === "implemented" && { implemented_at: new Date().toISOString() }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "SUPPORT_UPDATE_FAILED", "应答行动更新失败");
    await audit(auth, `support.${input.status}`, "support_action", id, { effectiveness: input.effectiveness ?? null });
    return { item: data };
  });

  app.get("/api/children/:id/growth", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { data: child } = await auth.data.from("children").select("*").eq("id", id).maybeSingle();
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在或无权访问");
    const [{ data: observations }, { data: analyses }, { data: supports }] = await Promise.all([
      auth.data.from("observations").select("*").eq("child_id", id).eq("status", "adopted").order("occurred_at"),
      auth.data.from("analysis_runs").select("*").eq("child_id", id).eq("decision", "adopted").order("generated_at"),
      auth.data.from("support_actions").select("*").eq("child_id", id).order("created_at"),
    ]);
    const analysisMap = new Map((analyses ?? []).map((item) => [item.observation_id, item]));
    return {
      child,
      timeline: (observations ?? []).map((observation) => ({
        observation,
        analysis: analysisMap.get(observation.id) ?? null,
        supports: (supports ?? []).filter((item) => item.observation_id === observation.id),
      })),
      coverage: {
        observations: observations?.length ?? 0,
        scenes: [...new Set((observations ?? []).map((item) => item.scene))],
        themes: mostFrequent((observations ?? []).map((item) => item.theme)),
        verifiedSupports: (supports ?? []).filter((item) => ["verified", "closed"].includes(item.status)).length,
      },
    };
  });

  app.get("/api/reports", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ childId: uuid.optional(), classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("period_reports").select("*").order("created_at", { ascending: false });
    if (query.childId) builder = builder.eq("child_id", query.childId);
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "REPORT_LIST_FAILED", "周期报告读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/reports/generate", async (request, reply) => {
    const auth = await authenticate(request);
    const input = z.object({
      classroomId: uuid,
      childId: uuid,
      reportType: z.enum(["teacher", "guardian"]),
      periodStart: date,
      periodEnd: date,
    }).refine((value) => value.periodEnd >= value.periodStart, { message: "结束日期不能早于开始日期" }).parse(request.body);
    const { data: child } = await auth.data.from("children").select("id, classroom_id, display_name").eq("id", input.childId).eq("classroom_id", input.classroomId).maybeSingle();
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在、班级不匹配或无权访问");
    const [{ data: observations }, { data: analyses }, { data: supports }] = await Promise.all([
      auth.data.from("observations").select("*").eq("child_id", child.id).eq("status", "adopted").gte("occurred_at", `${input.periodStart}T00:00:00+08:00`).lte("occurred_at", `${input.periodEnd}T23:59:59+08:00`).order("occurred_at"),
      auth.data.from("analysis_runs").select("*").eq("child_id", child.id).eq("decision", "adopted"),
      auth.data.from("support_actions").select("*").eq("child_id", child.id),
    ]);
    if (!observations?.length) throw new ApiError(409, "REPORT_EVIDENCE_INSUFFICIENT", "本周期没有教师已采用的连续证据，暂不能生成正式报告");
    const observationIds = observations.map((item) => item.id);
    const usedAnalyses = (analyses ?? []).filter((item) => observationIds.includes(item.observation_id));
    const usedSupports = (supports ?? []).filter((item) => observationIds.includes(item.observation_id));
    const growth = usedAnalyses.flatMap((item) => item.structured_result?.interpretations ?? []).map((item) => item.content).slice(0, 6);
    const familyGrowth = usedAnalyses.flatMap((item) => item.structured_result?.interestsAndStrengths ?? []).slice(0, 6);
    const content = {
      title: `${child.display_name}的游戏学习与发展记录`,
      evidenceBoundary: input.reportType === "guardian"
        ? "我们关注孩子在不同时候的变化，不与其他孩子比较。"
        : "只汇总教师明确采用的分析，不与其他幼儿比较。",
      observationCoverage: `${observations.length}次观察，覆盖${new Set(observations.map((item) => item.scene)).size}类游戏场景。`,
      interests: mostFrequent(observations.map((item) => item.theme)),
      evidencedGrowth: input.reportType === "guardian" && familyGrowth.length
        ? familyGrowth
        : growth.length
          ? growth
          : ["当前已有游戏证据，仍需更多时间点验证稳定变化。"],
      teacherSupport: usedSupports.map((item) => `${item.strategy}${item.child_response ? `；后续反应：${item.child_response}` : ""}`).slice(0, 6),
      pendingQuestions: usedAnalyses.flatMap((item) => item.structured_result?.evidenceGaps ?? []).slice(0, 5),
      nextPlan: usedAnalyses.flatMap((item) => item.structured_result?.nextObservation ?? []).slice(0, 5),
      familySuggestions: usedAnalyses.flatMap((item) => item.structured_result?.responseSuggestions?.activity ?? []).slice(0, 4),
      audience: input.reportType,
    };
    const { data, error } = await auth.data.from("period_reports").insert({
      tenant_id: auth.tenantId,
      classroom_id: input.classroomId,
      child_id: input.childId,
      report_type: input.reportType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      content,
      evidence_observation_ids: observationIds,
      created_by: auth.userId,
    }).select().single();
    if (error) throw new ApiError(500, "REPORT_GENERATE_FAILED", "周期报告生成失败");
    await audit(auth, "report.generated", "period_report", data.id, { reportType: data.report_type, evidenceCount: observationIds.length });
    return reply.status(201).send({ item: data });
  });

  app.patch("/api/reports/:id/status", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ status: z.enum(["reviewed", "published", "withdrawn"]) }).parse(request.body);
    const { data: current } = await auth.data.from("period_reports").select("status").eq("id", id).maybeSingle();
    if (!current) throw new ApiError(404, "REPORT_NOT_FOUND", "报告不存在或无权访问");
    const allowed: Record<string, string[]> = { draft: ["reviewed"], reviewed: ["published"], published: ["withdrawn"], withdrawn: [] };
    if (!(allowed[current.status] ?? []).includes(input.status)) throw new ApiError(409, "INVALID_REPORT_TRANSITION", "报告状态必须按草稿、审核、发布、撤回顺序推进");
    const { data, error } = await auth.data.from("period_reports").update({
      status: input.status,
      ...(input.status === "reviewed" && { reviewed_by: auth.userId }),
      ...(input.status === "published" && { published_at: new Date().toISOString() }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "REPORT_STATUS_FAILED", "报告状态更新失败");
    await audit(auth, `report.${input.status}`, "period_report", id);
    return { item: data };
  });

  app.get("/api/curriculum-clues", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({ classroomId: uuid.optional() }).parse(request.query);
    let builder = auth.data.from("curriculum_clues").select("*").order("updated_at", { ascending: false });
    if (query.classroomId) builder = builder.eq("classroom_id", query.classroomId);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "CURRICULUM_LIST_FAILED", "课程线索读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/curriculum-clues/scan", async (request) => {
    const auth = await authenticate(request);
    const { classroomId } = z.object({ classroomId: uuid }).parse(request.body);
    const { data: observations, error } = await auth.data.from("observations").select("id, child_id, theme, occurred_at, teacher_identification, teacher_response").eq("classroom_id", classroomId).eq("status", "adopted").order("occurred_at");
    if (error) throw new ApiError(500, "CURRICULUM_SCAN_FAILED", "课程线索扫描失败");
    const groups = new Map<string, typeof observations>();
    for (const observation of observations ?? []) groups.set(observation.theme.trim(), [...(groups.get(observation.theme.trim()) ?? []), observation]);
    const results = [];
    for (const [theme, group] of groups) {
      if (!group || group.length < 2) continue;
      const childIds = [...new Set(group.map((item) => item.child_id))];
      const timePoints = [...new Set(group.map((item) => item.occurred_at.slice(0, 10)))];
      const thresholdMet = (childIds.length >= 2 || group.length >= 3) && timePoints.length >= 2;
      const payload = {
        tenant_id: auth.tenantId,
        classroom_id: classroomId,
        title: `${theme}：持续探究课程线索`,
        theme,
        origin: `${group.length}条已采用观察，涉及${childIds.length}名幼儿、${timePoints.length}个时间点。`,
        inquiry_questions: group.map((item) => item.teacher_response?.nextObservationFocus).filter(Boolean).slice(0, 6),
        plan: { existingExperience: group.map((item) => item.teacher_identification).filter(Boolean).slice(0, 6), version: 1 },
        child_ids: childIds,
        evidence_observation_ids: group.map((item) => item.id),
        time_point_count: timePoints.length,
        threshold_met: thresholdMet,
        status: thresholdMet ? "draft" : "clue",
        created_by: auth.userId,
      };
      const { data: existing } = await auth.data.from("curriculum_clues").select("id, plan").eq("classroom_id", classroomId).eq("theme", theme).neq("status", "archived").maybeSingle();
      const operation = existing
        ? auth.data.from("curriculum_clues").update({ ...payload, plan: { ...payload.plan, version: Number(existing.plan?.version ?? 0) + 1 } }).eq("id", existing.id).select().single()
        : auth.data.from("curriculum_clues").insert(payload).select().single();
      const { data: saved, error: saveError } = await operation;
      if (saveError) throw new ApiError(500, "CURRICULUM_CLUE_SAVE_FAILED", "课程线索保存失败");
      results.push(saved);
    }
    await audit(auth, "curriculum.scanned", "classroom", classroomId, { observationCount: observations?.length ?? 0, clueCount: results.length });
    return { items: results };
  });

  app.patch("/api/curriculum-clues/:id", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      title: z.string().trim().min(2).max(160).optional(),
      inquiryQuestions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
      plan: z.record(z.unknown()).optional(),
      status: z.enum(["clue", "draft", "reviewed", "active", "reflected", "archived"]).optional(),
    }).parse(request.body);
    const { data: current } = await auth.data.from("curriculum_clues").select("plan, status").eq("id", id).maybeSingle();
    if (!current) throw new ApiError(404, "CURRICULUM_CLUE_NOT_FOUND", "课程线索不存在或无权访问");
    if (input.status !== undefined) {
      const allowed: Record<string, string[]> = { clue: ["draft", "archived"], draft: ["reviewed", "archived"], reviewed: ["active", "archived"], active: ["reflected", "archived"], reflected: ["archived"], archived: [] };
      if (!(allowed[current.status] ?? []).includes(input.status)) throw new ApiError(409, "INVALID_CURRICULUM_TRANSITION", "课程状态推进顺序不正确");
    }
    const { data, error } = await auth.data.from("curriculum_clues").update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.inquiryQuestions !== undefined && { inquiry_questions: input.inquiryQuestions }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.plan !== undefined && { plan: { ...input.plan, version: Number(current.plan?.version ?? 0) + 1 } }),
    }).eq("id", id).select().single();
    if (error) throw new ApiError(500, "CURRICULUM_UPDATE_FAILED", "课程草案更新失败");
    await audit(auth, "curriculum.updated", "curriculum_clue", id, { status: data.status, version: data.plan?.version });
    return { item: data };
  });
}
