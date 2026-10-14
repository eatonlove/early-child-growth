import { z } from "zod";

const uuid = z.string().uuid("请选择有效的记录或账号");
const text = (label: string, min: number, max: number) => z.string({required_error: `请填写${label}`}).trim()
  .min(min, min === 1 ? `请填写${label}` : `${label}至少需要${min}字（不含首尾空白）`)
  .max(max, `${label}不能超过${max}字`);

const responseSchema = z.object({
  category: z.enum(["experience", "material", "activity"]),
  strategy: text("教师原始应答", 2, 2000),
  nextObservationFocus: text("下一次观察重点", 2, 1000),
});
const observationSubjectSchema = z.object({
  childId: uuid,
  role: z.enum(["primary", "participant", "incidental"]),
  contextualFeature: text("本次情境特征", 0, 500).default(""),
  evidenceAnchors: z.array(text("媒体定位", 1, 160)).max(20, "每名幼儿最多填写20条媒体定位").default([]),
});
export const observationInput = z.object({
  classroomId: uuid,
  childId: uuid.optional(),
  subjects: z.array(observationSubjectSchema).min(1, "请至少选择一名观察幼儿").max(30, "最多选择30名参与幼儿").optional(),
  templateId: uuid.optional(),
  sourceImportId: uuid.optional(),
  observerName: text("观察教师", 1, 80),
  observerIds: z.array(uuid).max(12, "最多选择12名协同观察者").default([]),
  groupContext: text("群体情境", 0, 2000).default(""),
  unlistedParticipantCount: z.number().int("未列名参与人数须为整数").min(0, "未列名参与人数不能小于0").max(99, "未列名参与人数不能超过99").default(0),
  occurredAt: z.string().datetime({ offset: true, message: "请填写有效的发生时间" }),
  durationMinutes: z.number().int("持续分钟须为整数").min(1, "持续分钟至少为1；未记录时可以留空").max(240, "持续分钟不能超过240").optional(),
  scene: text("游戏场地", 1, 80),
  theme: text("游戏主题", 1, 120),
  organizationStage: z.enum(["plan", "introduction", "process", "sharing", "evaluation"]),
  observationFocusCategory: z.enum(["materials_tools", "cognition_experience", "social_experience"], {errorMap: () => ({message: "请选择材料与工具、认知与经验或交往与规则中的一项"})}),
  observationFocus: z.array(text("每项观察重点", 1, 80)).max(12, "观察重点最多12项，请用逗号或换行分隔").default([]),
  teacherObservation: text("客观白描", 10, 12000),
  teacherIdentification: text("教师识别", 5, 6000),
  teacherResponse: responseSchema,
}).superRefine((value, context) => {
  const subjects = value.subjects ?? (value.childId ? [{ childId: value.childId, role: "primary" as const, contextualFeature: "", evidenceAnchors: [] }] : []);
  if (!subjects.length) context.addIssue({ code: "custom", path: ["subjects"], message: "请至少选择一名观察幼儿" });
  if (new Set(subjects.map((item) => item.childId)).size !== subjects.length) context.addIssue({ code: "custom", path: ["subjects"], message: "观察幼儿不能重复" });
  if (subjects.filter((item) => item.role === "primary").length !== 1) context.addIssue({ code: "custom", path: ["subjects"], message: "必须且只能设置一名主要观察幼儿" });
});
