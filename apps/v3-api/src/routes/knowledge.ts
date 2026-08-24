import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recommendObservationTemplates } from "../domain/workflow-contracts.js";
import { ApiError, authenticate } from "../http.js";

export async function knowledgeRoutes(app: FastifyInstance) {
  app.get("/api/observation-templates", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({
      grade: z.enum(["small", "middle", "large"]).optional(),
      scene: z.string().trim().min(1).max(80).optional(),
    }).parse(request.query);
    let builder = auth.data
      .from("observation_templates")
      .select("*")
      .eq("status", "active")
      .order("name")
      .limit(100);
    if (query.grade) builder = builder.or(`grade.is.null,grade.eq.${query.grade}`);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "TEMPLATE_LIST_FAILED", "观察模板读取失败");
    const items = recommendObservationTemplates(data ?? [], query);
    return {
      items,
      recommendation: {
        grade: query.grade ?? null,
        scene: query.scene ?? null,
        matched: Boolean(query.grade || query.scene),
      },
    };
  });

  app.get("/api/knowledge", async (request) => {
    const auth = await authenticate(request);
    const query = z.object({
      grade: z.enum(["small", "middle", "large"]).optional(),
      domain: z.string().max(20).optional(),
      query: z.string().trim().max(80).optional(),
    }).parse(request.query);
    let builder = auth.data.from("knowledge_cards").select("*").eq("status", "active").order("domain").order("goal_number").limit(200);
    if (query.grade) builder = builder.eq("grade", query.grade);
    if (query.domain) builder = builder.eq("domain", query.domain);
    if (query.query) builder = builder.or(`title.ilike.%${query.query.replace(/[%_,()]/g, "") }%,code.ilike.%${query.query.replace(/[%_,()]/g, "")}%`);
    const { data, error } = await builder;
    if (error) throw new ApiError(500, "KNOWLEDGE_LIST_FAILED", "知识库读取失败");
    return { items: data ?? [], version: "guide-cn-2012.v1.0.0" };
  });

  app.get("/api/dashboard", async (request) => {
    const auth = await authenticate(request);
    const [classrooms, children, observations, analyses] = await Promise.all([
      auth.data.from("classrooms").select("id", { count: "exact", head: true }).eq("status", "active"),
      auth.data.from("children").select("id", { count: "exact", head: true }).eq("status", "active"),
      auth.data.from("observations").select("id", { count: "exact", head: true }),
      auth.data.from("analysis_runs").select("id", { count: "exact", head: true }).eq("decision", "pending"),
    ]);
    const failed = [classrooms, children, observations, analyses].find((result) => result.error);
    if (failed?.error) {
      request.log.error({ dbError: failed.error }, "dashboard query failed");
      throw new ApiError(500, "DASHBOARD_READ_FAILED", "工作台数据读取失败");
    }
    return { counts: { classrooms: classrooms.count ?? 0, children: children.count ?? 0, observations: observations.count ?? 0, pendingAnalyses: analyses.count ?? 0 }, role: auth.role };
  });
}
