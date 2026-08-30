export const developmentStates = ["初现", "发展中", "较稳定", "跨情境迁移"] as const;
export type DevelopmentState = (typeof developmentStates)[number];
export type DevelopmentStateOrPending = DevelopmentState | "待积累证据";

export const developmentDomains = ["健康", "语言", "社会", "科学", "艺术"] as const;
export const gameExperienceDimensions = ["计划与意图", "材料使用", "角色与情节", "问题解决", "合作协商", "规则与自我调节", "表达与回顾"] as const;
export const learningDispositionDimensions = ["好奇与探究", "主动性", "专注与坚持", "想象与创造", "合作", "反思与调整"] as const;

interface ObservationLike {
  id: string;
  occurred_at: string;
  scene: string;
}

interface AnalysisLike {
  observation_id: string;
  child_id?: string;
  structured_result?: Record<string, any> | null;
}

interface EvidencePoint {
  observationId: string;
  occurredAt: string;
  scene: string;
  summary: string;
}

export interface DevelopmentDimensionProfile {
  dimension: string;
  state: DevelopmentStateOrPending;
  evidenceCount: number;
  timePointCount: number;
  sceneCount: number;
  summary: string;
  evidenceObservationIds: string[];
}

export interface IndividualDevelopmentProfile {
  domains: DevelopmentDimensionProfile[];
  gameExperiences: DevelopmentDimensionProfile[];
  learningDispositions: DevelopmentDimensionProfile[];
  evidenceBoundary: string;
}

export interface ClassroomDevelopmentProfile {
  domains: Array<{
    domain: string;
    distribution: Record<DevelopmentStateOrPending, number>;
    evidenceCount: number;
    observedChildCount: number;
  }>;
  totalChildCount: number;
  evidenceBoundary: string;
}

const chinaDate = (value: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(value));

const transferPattern = /迁移|跨情境|不同(?:场景|材料|同伴)|再次独立|灵活运用|举一反三/;

function stateFor(points: EvidencePoint[]): DevelopmentStateOrPending {
  if (!points.length) return "待积累证据";
  const dates = new Set(points.map((item) => chinaDate(item.occurredAt))).size;
  const scenes = new Set(points.map((item) => item.scene)).size;
  if (dates >= 2 && scenes >= 2 && points.some((item) => transferPattern.test(item.summary))) return "跨情境迁移";
  if (points.length >= 3 && dates >= 2) return "较稳定";
  if (points.length >= 2 && dates >= 2) return "发展中";
  return "初现";
}

function profileForDimensions(dimensions: readonly string[], points: Map<string, EvidencePoint[]>) {
  return dimensions.map((dimension) => {
    const unique = [...new Map((points.get(dimension) ?? []).map((item) => [item.observationId, item])).values()]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return {
      dimension,
      state: stateFor(unique),
      evidenceCount: unique.length,
      timePointCount: new Set(unique.map((item) => chinaDate(item.occurredAt))).size,
      sceneCount: new Set(unique.map((item) => item.scene)).size,
      summary: unique.at(-1)?.summary ?? "当前周期尚无足够的教师确认证据。",
      evidenceObservationIds: unique.map((item) => item.observationId),
    } satisfies DevelopmentDimensionProfile;
  });
}

export function buildIndividualDevelopmentProfile(observations: ObservationLike[], analyses: AnalysisLike[]): IndividualDevelopmentProfile {
  const observationMap = new Map(observations.map((item) => [item.id, item]));
  const domains = new Map<string, EvidencePoint[]>();
  const games = new Map<string, EvidencePoint[]>();
  const dispositions = new Map<string, EvidencePoint[]>();
  const append = (target: Map<string, EvidencePoint[]>, dimension: string, analysis: AnalysisLike, summary: string) => {
    const observation = observationMap.get(analysis.observation_id);
    if (!observation || !dimension || !summary.trim()) return;
    target.set(dimension, [...(target.get(dimension) ?? []), {
      observationId: observation.id,
      occurredAt: observation.occurred_at,
      scene: observation.scene,
      summary: summary.trim(),
    }]);
  };

  analyses.forEach((analysis) => {
    const result = analysis.structured_result ?? {};
    (result.domainExperiences ?? []).forEach((item: any) => {
      if (!item.noJudgment) append(domains, item.domain, analysis, item.possibleExperience || item.evidence || "");
    });
    if (!(result.domainExperiences ?? []).length) {
      (result.developmentReferences ?? []).forEach((item: any) => {
        if (item.status !== "证据不足") append(domains, item.domain, analysis, item.evidenceStatement || item.title || "");
      });
    }
    (result.gameExperience ?? []).forEach((item: any) => append(games, item.dimension, analysis, item.possibleExperience || item.evidence || ""));
    (result.learningDispositions ?? []).forEach((item: any) => append(dispositions, item.dimension, analysis, item.possibleExperience || item.evidence || ""));
  });

  return {
    domains: profileForDimensions(developmentDomains, domains),
    gameExperiences: profileForDimensions(gameExperienceDimensions, games),
    learningDispositions: profileForDimensions(learningDispositionDimensions, dispositions),
    evidenceBoundary: "发展状态仅依据本周期教师确认采用的多时间点游戏证据形成，不代表测评分数、排名或诊断。",
  };
}

export function buildClassroomDevelopmentProfile(input: {
  childIds: string[];
  observations: ObservationLike[];
  analyses: AnalysisLike[];
}): ClassroomDevelopmentProfile {
  const profiles = new Map(input.childIds.map((childId) => [
    childId,
    buildIndividualDevelopmentProfile(input.observations, input.analyses.filter((item) => item.child_id === childId)),
  ]));
  const domains = developmentDomains.map((domain) => {
    const distribution: Record<DevelopmentStateOrPending, number> = {
      初现: 0,
      发展中: 0,
      较稳定: 0,
      跨情境迁移: 0,
      待积累证据: 0,
    };
    let evidenceCount = 0;
    profiles.forEach((profile) => {
      const item = profile.domains.find((entry) => entry.dimension === domain)!;
      distribution[item.state] += 1;
      evidenceCount += item.evidenceCount;
    });
    return {
      domain,
      distribution,
      evidenceCount,
      observedChildCount: input.childIds.length - distribution.待积累证据,
    };
  });
  return {
    domains,
    totalChildCount: input.childIds.length,
    evidenceBoundary: "班级图表呈现教师确认证据中的发展状态分布与覆盖缺口，不用于幼儿间比较。",
  };
}
