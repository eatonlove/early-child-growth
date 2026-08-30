interface InterestObservation {
  id: string;
  theme: string;
  occurred_at: string;
  child_id: string;
  participant_child_ids?: string[];
}

export interface InterestInsight {
  label: string;
  aliases: string[];
  observationCount: number;
  timePointCount: number;
  childCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceObservationIds: string[];
  childIds: string[];
}

const chinaDate = (value: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(value));

const normalizeTheme = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[\s·•，,。.!！?？:：;；、“”‘’（）()《》【】\-_]/g, "")
  .replace(/(?:主题)?(?:游戏|活动|探秘|探索|计划)$/g, "") || value.trim().toLowerCase();

const bigrams = (value: string) => {
  const chars = Array.from(normalizeTheme(value));
  if (chars.length < 4) return new Set([chars.join("")]);
  return new Set(chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`));
};

function themesMatch(left: string, right: string) {
  const a = normalizeTheme(left);
  const b = normalizeTheme(right);
  if (a === b) return true;
  if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  const leftPairs = bigrams(a);
  const rightPairs = bigrams(b);
  const overlap = [...leftPairs].filter((item) => rightPairs.has(item)).length;
  const union = new Set([...leftPairs, ...rightPairs]).size;
  return overlap >= 2 && overlap / union >= 0.25;
}

function clusterObservations(observations: InterestObservation[]) {
  const clusters: InterestObservation[][] = [];
  observations.forEach((observation) => {
    const cluster = clusters.find((items) => items.some((item) => themesMatch(item.theme, observation.theme)));
    if (cluster) cluster.push(observation);
    else clusters.push([observation]);
  });
  return clusters;
}

function summarize(items: InterestObservation[]): InterestInsight {
  const aliases = [...new Set(items.map((item) => item.theme.trim()).filter(Boolean))];
  const label = [...aliases].sort((a, b) => items.filter((item) => item.theme === b).length - items.filter((item) => item.theme === a).length)[0] ?? "未命名兴趣";
  const dates = items.map((item) => item.occurred_at).sort();
  const childIds = [...new Set(items.flatMap((item) => item.participant_child_ids?.length ? item.participant_child_ids : [item.child_id]))];
  return {
    label,
    aliases,
    observationCount: items.length,
    timePointCount: new Set(items.map((item) => chinaDate(item.occurred_at))).size,
    childCount: childIds.length,
    firstSeenAt: dates[0] ?? "",
    lastSeenAt: dates.at(-1) ?? "",
    evidenceObservationIds: items.map((item) => item.id),
    childIds,
  };
}

export function buildInterestInsights(observations: InterestObservation[], childId: string) {
  const clusters = clusterObservations(observations);
  const sustainedInterests = clusters
    .map((cluster) => cluster.filter((item) => (item.participant_child_ids?.length ? item.participant_child_ids : [item.child_id]).includes(childId)))
    .filter((items) => items.length >= 2 && new Set(items.map((item) => chinaDate(item.occurred_at))).size >= 2)
    .map(summarize)
    .sort((a, b) => b.observationCount - a.observationCount);
  const sharedInterests = clusters
    .map(summarize)
    .filter((item) => item.childCount >= 2 && item.timePointCount >= 2)
    .sort((a, b) => b.childCount - a.childCount || b.observationCount - a.observationCount);
  return { sustainedInterests, sharedInterests };
}
