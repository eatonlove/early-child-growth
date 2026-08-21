import knowledgeSource from "../seed/guide-knowledge.json" with { type: "json" };
import { config } from "../src/config.js";
import { serviceClient } from "../src/supabase.js";

const gradeMap: Record<string, "small" | "middle" | "large" | null> = { 小班: "small", 中班: "middle", 大班: "large", 跨年龄: null };
const cards = knowledgeSource.map((card) => ({
  tenant_id: null,
  code: card.code,
  source: card.source,
  source_version: card.sourceVersion,
  domain: card.domain,
  subdomain: card.subdomain,
  goal_number: card.goalNumber,
  grade: gradeMap[card.grade] ?? null,
  age_band: card.ageBand,
  title: card.title,
  official_expectations: card.officialExpectations,
  observable_behaviors: card.observableBehaviors,
  evidence_requirements: card.evidenceRequirements,
  assessment_guidance: card.assessmentGuidance,
  misunderstanding_warning: card.misunderstandingWarning,
  response_strategies: card.responseStrategies,
  next_observation_prompts: card.nextObservationPrompts,
  keywords: card.keywords,
  version: 1,
  status: "active",
}));

const templates = [
  { code: "BUILDING", name: "建构游戏标准观察表", scenes: ["建构区", "积木区"], focus_options: ["材料选择与使用", "空间与结构", "问题发现与解决", "同伴协商", "表达与表征"], fields: ["情境与意图", "连续动作", "材料变化", "幼儿原话", "教师介入", "支持后的变化"] },
  { code: "ROLE_PLAY", name: "角色游戏标准观察表", scenes: ["角色区", "表演区"], focus_options: ["角色意识", "情节发展", "语言协商", "规则形成", "情绪与关系"], fields: ["角色分配", "情节事件", "同伴对话", "冲突与协商", "教师介入", "分享与评价"] },
  { code: "SAND_WATER", name: "沙水游戏标准观察表", scenes: ["沙水区", "自然探秘场"], focus_options: ["感知与比较", "工具使用", "问题解决", "合作探究", "持续投入"], fields: ["探究问题", "材料工具", "操作序列", "幼儿解释", "策略调整", "后续问题"] },
  { code: "OUTDOOR", name: "户外运动游戏标准观察表", scenes: ["户外场地", "运动区"], focus_options: ["动作协调", "风险判断", "规则意识", "坚持性", "同伴支持"], fields: ["动作目标", "尝试过程", "困难与调整", "安全行为", "同伴互动", "教师支持"] },
  { code: "ART", name: "艺术表现游戏标准观察表", scenes: ["美工区", "表演区", "音乐区"], focus_options: ["感受与欣赏", "想象与创造", "材料表征", "个性表达", "分享评价"], fields: ["兴趣来源", "材料选择", "表现过程", "作品或动作", "幼儿解释", "教师回应"] },
  { code: "SCIENCE", name: "科学探究游戏标准观察表", scenes: ["科学区", "自然角"], focus_options: ["问题提出", "观察比较", "猜想验证", "记录表征", "解释交流"], fields: ["初始问题", "猜想", "操作与观察", "证据记录", "解释", "新问题"] },
  { code: "COOPERATION", name: "混龄与合作游戏标准观察表", scenes: ["混龄区", "综合游戏区"], focus_options: ["主动交往", "分工合作", "观点协商", "规则维护", "共同解决问题"], fields: ["共同目标", "角色分工", "协商过程", "冲突处理", "共同成果", "复盘表达"] },
].map((template) => ({ ...template, tenant_id: null, grade: null, version: 1, status: "active", created_by: null }));

const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
const { error: knowledgeError } = await schema.from("knowledge_cards").upsert(cards, { onConflict: "tenant_id,code,version" });
if (knowledgeError) throw knowledgeError;
const { error: templateError } = await schema.from("observation_templates").upsert(templates, { onConflict: "tenant_id,code,version" });
if (templateError) throw templateError;

console.log(`已写入 ${cards.length} 张知识卡和 ${templates.length} 套标准观察模板。`);
