import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAIProvider } from "../ai/provider.js";
import { effectiveAnalysisResult } from "../analysis-claims.js";
import { config } from "../config.js";
import { ApiError, audit, authenticate } from "../http.js";
import { chinaCalendarDate, reportEvidenceCoverage } from "../report-evidence.js";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nextSupportStatus: Record<string, string[]> = {
  planned: ["implemented"],
  implemented: ["follow_up"],
  follow_up: ["verified"],
  verified: ["closed"],
  closed: [],
};

const aiProvider = createAIProvider({
  mode: config.AI_MODE,
  apiKey: config.qwenApiKey,
  baseUrl: config.QWEN_BASE_URL,
  textModel: config.QWEN_TEXT_MODEL,
  visionModel: config.QWEN_VISION_MODEL,
  timeoutMs: config.QWEN_TIMEOUT_MS,
  fallbackToSimulated: config.aiFallbackToSimulated,
});

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
    const { data: current, error: currentError } = await auth.data.from("support_actions").select("*").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "SUPPORT_READ_FAILED", "应答行动读取失败");
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
    const { data: child, error: childError } = await auth.data.from("children").select("*").eq("id", id).maybeSingle();
    if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿档案读取失败");
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在或无权访问");
    const [{ data: observations, error: observationError }, { data: analyses, error: analysisError }, { data: supports, error: supportError }] = await Promise.all([
      auth.data.from("observations").select("*").eq("child_id", id).eq("status", "adopted").order("occurred_at"),
      auth.data.from("analysis_runs").select("*").eq("child_id", id).eq("decision", "adopted").order("generated_at"),
      auth.data.from("support_actions").select("*").eq("child_id", id).order("created_at"),
    ]);
    if (observationError || analysisError || supportError) throw new ApiError(500, "GROWTH_READ_FAILED", "成长轨迹读取失败");
    const analysisIds = (analyses ?? []).map((item) => item.id);
    const { data: claimReviews, error: reviewError } = analysisIds.length
      ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds)
      : { data: [], error: null };
    if (reviewError) throw new ApiError(500, "GROWTH_REVIEW_READ_FAILED", "成长轨迹正式审核结论读取失败");
    const analysisMap = new Map((analyses ?? []).map((item) => [item.observation_id, {
      ...item,
      structured_result: effectiveAnalysisResult(item.structured_result, (claimReviews ?? []).filter((review) => review.analysis_run_id === item.id)),
      claim_reviews: (claimReviews ?? []).filter((review) => review.analysis_run_id === item.id),
    }]));
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
    const { data: child, error: childError } = await auth.data.from("children").select("id, classroom_id, display_name").eq("id", input.childId).eq("classroom_id", input.classroomId).maybeSingle();
    if (childError) throw new ApiError(500, "CHILD_LOOKUP_FAILED", "幼儿档案读取失败");
    if (!child) throw new ApiError(404, "CHILD_NOT_FOUND", "幼儿不存在、班级不匹配或无权访问");
    const [{ data: observations, error: observationError }, { data: analyses, error: analysisError }, { data: supports, error: supportError }] = await Promise.all([
      auth.data.from("observations").select("*").eq("child_id", child.id).eq("status", "adopted").gte("occurred_at", `${input.periodStart}T00:00:00+08:00`).lte("occurred_at", `${input.periodEnd}T23:59:59+08:00`).order("occurred_at"),
      auth.data.from("analysis_runs").select("*").eq("child_id", child.id).eq("decision", "adopted"),
      auth.data.from("support_actions").select("*").eq("child_id", child.id),
    ]);
    if (observationError || analysisError || supportError) throw new ApiError(500, "REPORT_CONTEXT_READ_FAILED", "周期报告证据读取失败");
    const coverage = reportEvidenceCoverage(observations ?? []);
    if (!coverage.eligible) {
      throw new ApiError(409, "REPORT_MULTI_TIMEPOINT_REQUIRED", "周期报告至少需要2条、跨2个不同日期且经教师终审采用的观察证据");
    }
    const observationIds = observations.map((item) => item.id);
    const usedAnalyses = (analyses ?? []).filter((item) => observationIds.includes(item.observation_id));
    const analysisIds = usedAnalyses.map((item) => item.id);
    const { data: claimReviews, error: reviewError } = analysisIds.length
      ? await auth.data.from("analysis_claim_reviews").select("*").in("analysis_run_id", analysisIds)
      : { data: [], error: null };
    if (reviewError) throw new ApiError(500, "REPORT_REVIEW_CONTEXT_FAILED", "报告正式审核结论读取失败");
    const effectiveAnalyses = usedAnalyses.map((analysis) => ({
      ...analysis,
      structured_result: effectiveAnalysisResult(analysis.structured_result, (claimReviews ?? []).filter((review) => review.analysis_run_id === analysis.id)),
    }));
    const usedSupports = (supports ?? []).filter((item) => observationIds.includes(item.observation_id));
    let generated;
    try {
      generated = await aiProvider.generateReport({
        reportType: input.reportType,
        childName: child.display_name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        observations,
        analyses: effectiveAnalyses,
        supports: usedSupports,
      });
    } catch {
      throw new ApiError(502, "AI_REPORT_FAILED", "AI报告生成暂时不可用，请稍后重试");
    }
    if (generated.fallbackReason) {
      request.log.warn({
        childId: child.id,
        reportType: input.reportType,
        fallbackReason: generated.fallbackReason,
      }, "AI report provider used safe fallback");
    }
    const content = {
      ...generated.data,
      aiMeta: {
        provider: generated.provider,
        model: generated.model,
        promptVersion: generated.promptVersion,
        fallbackUsed: Boolean(generated.fallbackReason),
      },
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
    await audit(auth, "report.generated", "period_report", data.id, {
      reportType: data.report_type,
      evidenceCount: observationIds.length,
      timePointCount: coverage.timePointCount,
      provider: generated.provider,
      model: generated.model,
      fallbackUsed: Boolean(generated.fallbackReason),
    });
    return reply.status(201).send({ item: data, aiNotice: generated.notice });
  });

  app.patch("/api/reports/:id/status", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ status: z.enum(["reviewed", "published", "withdrawn"]) }).parse(request.body);
    const { data: current, error: currentError } = await auth.data.from("period_reports").select("status").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "REPORT_READ_FAILED", "报告状态读取失败");
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

  app.post("/api/curriculum-clues/scan", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request) => {
    const auth = await authenticate(request);
    const { classroomId } = z.object({ classroomId: uuid }).parse(request.body);
    const { data: observations, error } = await auth.data.from("observations").select("id, child_id, scene, theme, occurred_at, teacher_identification, teacher_response").eq("classroom_id", classroomId).eq("status", "adopted").order("occurred_at");
    if (error) throw new ApiError(500, "CURRICULUM_SCAN_FAILED", "课程线索扫描失败");
    if (!observations?.length) return { items: [] };
    let clustered;
    try {
      clustered = await aiProvider.clusterInterests({ observations: observations.map((item) => ({
        id: item.id,
        theme: item.theme,
        scene: item.scene,
        teacher_identification: item.teacher_identification,
        teacher_response: item.teacher_response,
      })) });
    } catch {
      throw new ApiError(502, "AI_INTEREST_CLUSTER_FAILED", "兴趣语义聚类暂时不可用，请稍后重试");
    }
    if (clustered.fallbackReason) request.log.warn({ classroomId, fallbackReason: clustered.fallbackReason }, "interest clustering used safe fallback");
    const observationMap = new Map(observations.map((item) => [item.id, item]));
    const results = [];
    for (const cluster of clustered.data.clusters) {
      const theme = cluster.label;
      const group = cluster.observationIds.map((id) => observationMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!group || group.length < 2) continue;
      const childIds = [...new Set(group.map((item) => item.child_id))];
      const timePoints = [...new Set(group.map((item) => chinaCalendarDate(item.occurred_at)))];
      const thresholdMet = (childIds.length >= 2 || group.length >= 3) && timePoints.length >= 2;
      let generated = null;
      if (thresholdMet) {
        try {
          generated = await aiProvider.generateCurriculum({
            theme,
            observationCount: group.length,
            childCount: childIds.length,
            timePointCount: timePoints.length,
            observations: group,
          });
        } catch {
          throw new ApiError(502, "AI_CURRICULUM_FAILED", "AI课程草案生成暂时不可用，请稍后重试");
        }
        if (generated.fallbackReason) {
          request.log.warn({
            classroomId,
            theme,
            fallbackReason: generated.fallbackReason,
          }, "AI curriculum provider used safe fallback");
        }
      }
      const draft = generated?.data;
      const payload = {
        tenant_id: auth.tenantId,
        classroom_id: classroomId,
        title: draft?.title ?? `${theme}：持续探究课程线索`,
        theme,
        origin: draft?.origin ?? `${group.length}条已采用观察，涉及${childIds.length}名幼儿、${timePoints.length}个时间点。`,
        inquiry_questions: draft?.inquiryQuestions ?? group.map((item) => item.teacher_response?.nextObservationFocus).filter(Boolean).slice(0, 6),
        plan: draft ? {
          existingExperience: draft.existingExperience,
          keyExperiences: draft.keyExperiences,
          environmentAndMaterials: draft.materialsAndEnvironment,
          possiblePathways: draft.possiblePaths,
          observationFocus: draft.observationFocus,
          familyAndCommunity: draft.familyAndCommunity,
          adjustmentBasis: draft.adjustmentBasis,
          aiMeta: {
            provider: generated?.provider,
            model: generated?.model,
            promptVersion: generated?.promptVersion,
            fallbackUsed: Boolean(generated?.fallbackReason),
          },
          semanticCluster: {
            label: cluster.label,
            aliases: cluster.aliases,
            rationale: cluster.rationale,
            provider: clustered.provider,
            model: clustered.model,
            promptVersion: clustered.promptVersion,
            fallbackUsed: Boolean(clustered.fallbackReason),
          },
          version: 1,
        } : {
          existingExperience: group.map((item) => item.teacher_identification).filter(Boolean).slice(0, 6),
          semanticCluster: {
            label: cluster.label,
            aliases: cluster.aliases,
            rationale: cluster.rationale,
            provider: clustered.provider,
            model: clustered.model,
            promptVersion: clustered.promptVersion,
            fallbackUsed: Boolean(clustered.fallbackReason),
          },
          version: 1,
        },
        child_ids: childIds,
        evidence_observation_ids: group.map((item) => item.id),
        time_point_count: timePoints.length,
        threshold_met: thresholdMet,
        status: thresholdMet ? "draft" : "clue",
        created_by: auth.userId,
      };
      const { data: existing, error: existingError } = await auth.data.from("curriculum_clues").select("id, plan").eq("classroom_id", classroomId).eq("theme", theme).neq("status", "archived").maybeSingle();
      if (existingError) throw new ApiError(500, "CURRICULUM_CLUE_READ_FAILED", "课程线索读取失败");
      const operation = existing
        ? auth.data.from("curriculum_clues").update({ ...payload, plan: { ...payload.plan, version: Number(existing.plan?.version ?? 0) + 1 } }).eq("id", existing.id).select().single()
        : auth.data.from("curriculum_clues").insert(payload).select().single();
      const { data: saved, error: saveError } = await operation;
      if (saveError) throw new ApiError(500, "CURRICULUM_CLUE_SAVE_FAILED", "课程线索保存失败");
      results.push(saved);
    }
    await audit(auth, "curriculum.scanned", "classroom", classroomId, {
      observationCount: observations?.length ?? 0,
      clueCount: results.length,
      aiMode: config.AI_MODE,
      clusteringProvider: clustered.provider,
      clusteringModel: clustered.model,
    });
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
    const { data: current, error: currentError } = await auth.data.from("curriculum_clues").select("plan, status").eq("id", id).maybeSingle();
    if (currentError) throw new ApiError(500, "CURRICULUM_CLUE_READ_FAILED", "课程线索读取失败");
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
