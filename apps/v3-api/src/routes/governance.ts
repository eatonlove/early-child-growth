import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canTransitionResearchActivity } from "../domain/workflow-contracts.js";
import { ApiError, audit, authenticate, requireResearcher } from "../http.js";

const uuid = z.string().uuid();

const activityInput = z.object({
  classroomId: uuid.optional(),
  observationId: uuid.optional(),
  title: z.string().trim().min(2).max(160),
  scheduledAt: z.string().datetime({ offset: true }),
  sharedEvidenceTitle: z.string().trim().max(300).default(""),
  focusOptions: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
});

export async function governanceRoutes(app: FastifyInstance) {
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
    const { data: activity, error: activityError } = await auth.data
      .from("research_activities")
      .select("id, tenant_id, status")
      .eq("id", id)
      .maybeSingle();
    if (activityError) throw new ApiError(500, "RESEARCH_ACTIVITY_READ_FAILED", "教研活动读取失败");
    if (!activity) throw new ApiError(404, "RESEARCH_ACTIVITY_NOT_FOUND", "教研活动不存在或无权参加");
    if (activity.status !== "in_progress") {
      throw new ApiError(409, "RESEARCH_ACTIVITY_NOT_OPEN", "教研活动尚未开始或已经结束");
    }
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
