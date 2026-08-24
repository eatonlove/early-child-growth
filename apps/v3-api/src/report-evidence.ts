export function chinaCalendarDate(value: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function reportEvidenceCoverage(observations: Array<{ occurred_at: string }>) {
  const timePointCount = new Set(observations.map((item) => chinaCalendarDate(item.occurred_at))).size;
  return {
    observationCount: observations.length,
    timePointCount,
    eligible: observations.length >= 2 && timePointCount >= 2,
  };
}
