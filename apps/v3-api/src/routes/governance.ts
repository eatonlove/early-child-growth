import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { canTransitionResearchActivity } from "../domain/workflow-contracts.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";
import { serviceClient } from "../supabase.js";

const uuid = z.string().uuid();
const score = z.number().int().min(1).max(5);

const qualityInput = z.object({
  observationId: uuid,
  factuality: score,
  specificity: score,
  chronology: score,
  evidenceAlignment: score,
  subjectivePhrases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  comment: z.string().trim().max(3000).default(""),
  status: z.enum(["pending", "passed", "revision_requested"]),
});

const exportInput = z.object({
  exportType: z.enum(["individual_report", "curriculum_case", "anonymized_research"]),
  resourceId: uuid,
  purpose: z.string().trim().min(2).max(1000),
  recipient: z.string().trim().min(2).max(300),
  anonymized: z.boolean().default(true),
});

const exportResources = {
  individual_report: { table: "period_reports", type: "period_report" },
  curriculum_case: { table: "curriculum_clues", type: "curriculum_clue" },
  anonymized_research: { table: "research_activities", type: "research_activity" },
} as const;

const activityInput = z.object({
  classroomId: uuid.optional(),
  observationId: uuid.optional(),
  title: z.string().trim().min(2).max(160),
  scheduledAt: z.string().datetime({ offset: true }),
  sharedEvidenceTitle: z.string().trim().max(300).default(""),
  focusOptions: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
});

export async function governanceRoutes(app: FastifyInstance) {
  app.get("/api/quality-reviews", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const [{ data: observations, error }, { data: reviews, error: reviewError }, { data: children, error: childError }] = await Promise.all([
      schema
        .from("observations")
        .select("id, classroom_id, child_id, title, occurred_at, teacher_observation, child_quote, status, created_at")
        .eq("tenant_id", auth.tenantId)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(200),
      schema.from("observation_quality_reviews").select("*").eq("tenant_id", auth.tenantId),
      schema.from("children").select("id, display_name").eq("tenant_id", auth.tenantId),
    ]);
    if (error || reviewError || childError) throw new ApiError(500, "QUALITY_QUEUE_FAILED", "观察质量审核队列读取失败");
    const reviewMap = new Map((reviews ?? []).map((item) => [item.observation_id, item]));
    const childMap = new Map((children ?? []).map((item) => [item.id, item.display_name]));
    return {
      items: (observations ?? []).map((observation) => ({
        observation,
        childName: childMap.get(observation.child_id) ?? "园内幼儿",
        review: reviewMap.get(observation.id) ?? null,
      })),
    };
  });

  app.post("/api/quality-reviews", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = qualityInput.parse(request.body);
    const { data: observation, error: observationError } = await auth.data
      .from("observations")
      .select("id, classroom_id")
      .eq("id", input.observationId)
      .maybeSingle();
    if (observationError) throw new ApiError(500, "OBSERVATION_LOOKUP_FAILED", "观察记录读取失败");
    if (!observation) throw new ApiError(404, "OBSERVATION_NOT_FOUND", "观察记录不存在或无权审核");
    const { data, error } = await auth.data
      .from("observation_quality_reviews")
      .upsert(
        {
          tenant_id: auth.tenantId,
          classroom_id: observation.classroom_id,
          observation_id: observation.id,
          reviewer_id: auth.userId,
          factuality: input.factuality,
          specificity: input.specificity,
          chronology: input.chronology,
          evidence_alignment: input.evidenceAlignment,
          subjective_phrases: input.subjectivePhrases,
          comment: input.comment,
          status: input.status,
          reviewed_at: input.status === "pending" ? null : new Date().toISOString(),
        },
        { onConflict: "observation_id" },
      )
      .select()
      .single();
    if (error) throw new ApiError(500, "QUALITY_REVIEW_SAVE_FAILED", "质量审核保存失败");
    await audit(auth, `quality_review.${input.status}`, "observation_quality_review", data.id, {
      observationId: observation.id,
      scores: [input.factuality, input.specificity, input.chronology, input.evidenceAlignment],
    });
    return { item: data };
  });

  app.get("/api/export-requests", async (request) => {
    const auth = await authenticate(request);
    const { data, error } = await auth.data.from("export_requests").select("*").order("created_at", { ascending: false });
    if (error) throw new ApiError(500, "EXPORT_REQUEST_LIST_FAILED", "导出申请读取失败");
    return { items: data ?? [] };
  });

  app.post("/api/export-requests", async (request, reply) => {
    const auth = await authenticate(request);
    const input = exportInput.parse(request.body);
    const resource = exportResources[input.exportType];
    const { data: source, error: sourceError } = await auth.data
      .from(resource.table)
      .select("id, classroom_id")
      .eq("id", input.resourceId)
      .maybeSingle();
    if (sourceError) throw new ApiError(500, "EXPORT_RESOURCE_LOOKUP_FAILED", "导出对象读取失败");
    if (!source) throw new ApiError(404, "EXPORT_RESOURCE_NOT_FOUND", "导出对象不存在或无权访问");
    const { data, error } = await auth.data
      .from("export_requests")
      .insert({
        tenant_id: auth.tenantId,
        classroom_id: source.classroom_id ?? null,
        requested_by: auth.userId,
        export_type: input.exportType,
        resource_type: resource.type,
        resource_id: input.resourceId,
        purpose: input.purpose,
        recipient: input.recipient,
        anonymized: input.anonymized,
      })
      .select()
      .single();
    if (error) throw new ApiError(error.code === "42501" ? 403 : 500, "EXPORT_REQUEST_CREATE_FAILED", error.code === "42501" ? "无权为该班级申请导出" : "导出申请创建失败");
    await audit(auth, "export.requested", "export_request", data.id, { exportType: data.export_type, resourceId: data.resource_id });
    return reply.status(201).send({ item: data });
  });

  app.patch("/api/export-requests/:id/decision", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().min(2).max(1000) }).parse(request.body);
    const { data, error } = await auth.data
      .from("export_requests")
      .update({ status: input.decision, decision_note: input.note, decided_by: auth.userId, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error || !data) throw new ApiError(409, "EXPORT_REQUEST_DECISION_FAILED", "申请不存在、无权审批或已经处理");
    await audit(auth, `export.${input.decision}`, "export_request", id, { note: input.note });
    return { item: data };
  });

  app.get("/api/research-activities", async (request) => {
    const auth = await authenticate(request);
    const [{ data: activities, error }, { data: entries, error: entriesError }] = await Promise.all([
      auth.data.from("research_activities").select("*").order("scheduled_at", { ascending: false }),
      auth.data.from("research_activity_entries").select("*").order("created_at"),
    ]);
    if (error || entriesError) throw new ApiError(500, "RESEARCH_ACTIVITY_LIST_FAILED", "教研活动读取失败");
    return {
      items: (activities ?? []).map((activity) => ({
        ...activity,
        entries: (entries ?? []).filter((entry) => entry.activity_id === activity.id),
      })),
    };
  });

  app.post("/api/research-activities", async (request, reply) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const input = activityInput.parse(request.body);
    const { data, error } = await auth.data
      .from("research_activities")
      .insert({
        tenant_id: auth.tenantId,
        classroom_id: input.classroomId ?? null,
        observation_id: input.observationId ?? null,
        title: input.title,
        scheduled_at: input.scheduledAt,
        facilitator_id: auth.userId,
        shared_evidence_title: input.sharedEvidenceTitle,
        focus_options: input.focusOptions,
        created_by: auth.userId,
      })
      .select()
      .single();
    if (error) {
      request.log.error({
        dbError: { code: error.code, message: error.message, details: error.details, hint: error.hint },
      }, "research activity creation failed");
      throw new ApiError(error.code === "42501" ? 403 : 500, "RESEARCH_ACTIVITY_CREATE_FAILED", "教研活动创建失败");
    }
    await audit(auth, "research_activity.created", "research_activity", data.id, { title: data.title });
    return reply.status(201).send({ item: { ...data, entries: [] } });
  });

  app.patch("/api/research-activities/:id", async (request) => {
    const auth = await authenticate(request);
    requireResearcher(auth);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      status: z.enum(["preparing", "in_progress", "completed", "archived"]).optional(),
      comparisonSummary: z.string().trim().max(6000).optional(),
      followUpQuestions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    }).parse(request.body);
    const { data: current, error: currentError } = await auth.data
      .from("research_activities")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw new ApiError(500, "RESEARCH_ACTIVITY_READ_FAILED", "教研活动状态读取失败");
    if (!current) throw new ApiError(404, "RESEARCH_ACTIVITY_NOT_FOUND", "教研活动不存在或无权修改");
    if (input.status && !canTransitionResearchActivity(current.status, input.status)) {
      throw new ApiError(409, "INVALID_RESEARCH_TRANSITION", `不能从“${current.status}”直接变更为“${input.status}”`);
    }
    const { data, error } = await auth.data
      .from("research_activities")
      .update({
        ...(input.status !== undefined && { status: input.status }),
        ...(input.comparisonSummary !== undefined && { comparison_summary: input.comparisonSummary }),
        ...(input.followUpQuestions !== undefined && { follow_up_questions: input.followUpQuestions }),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new ApiError(500, "RESEARCH_ACTIVITY_UPDATE_FAILED", "教研活动更新失败");
    await audit(auth, "research_activity.updated", "research_activity", id, { status: data.status });
    return { item: data };
  });

  app.post("/api/research-activities/:id/entries", async (request) => {
    const auth = await authenticate(request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const input = z.object({
      groupName: z.string().trim().min(1).max(60),
      objectiveObservation: z.string().trim().min(10).max(6000),
      identification: z.string().trim().min(5).max(3000),
      responseStrategy: z.string().trim().min(5).max(3000),
    }).parse(request.body);
    const { data: activity, error: activityError } = await auth.data.from("research_activities").select("id, tenant_id, status").eq("id", id).maybeSingle();
    if (activityError) throw new ApiError(500, "RESEARCH_ACTIVITY_READ_FAILED", "教研活动读取失败");
    if (!activity) throw new ApiError(404, "RESEARCH_ACTIVITY_NOT_FOUND", "教研活动不存在或无权参加");
    if (activity.status !== "in_progress") throw new ApiError(409, "RESEARCH_ACTIVITY_NOT_OPEN", "教研活动尚未开始或已经结束");
    const { data, error } = await auth.data
      .from("research_activity_entries")
      .upsert(
        {
          tenant_id: auth.tenantId,
          activity_id: id,
          group_name: input.groupName,
          objective_observation: input.objectiveObservation,
          identification: input.identification,
          response_strategy: input.responseStrategy,
          created_by: auth.userId,
        },
        { onConflict: "activity_id,created_by" },
      )
      .select()
      .single();
    if (error) throw new ApiError(500, "RESEARCH_ENTRY_SAVE_FAILED", "教研独立记录保存失败");
    await audit(auth, "research_activity.entry_saved", "research_activity_entry", data.id, { activityId: id });
    return { item: data };
  });
}
