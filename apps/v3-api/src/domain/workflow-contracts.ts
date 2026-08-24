export interface ObservationTemplateCandidate {
  grade: string | null;
  scenes: string[];
  name: string;
}

export function recommendObservationTemplates<T extends ObservationTemplateCandidate>(
  templates: T[],
  filters: { grade?: string; scene?: string },
) {
  const score = (item: T) =>
    Number(Boolean(filters.grade && item.grade === filters.grade)) * 2
    + Number(Boolean(filters.scene && item.scenes.includes(filters.scene)));

  return templates
    .filter((item) => !filters.scene || item.scenes.length === 0 || item.scenes.includes(filters.scene))
    .sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name, "zh-CN"));
}

const nextResearchStatus: Record<string, string[]> = {
  preparing: ["in_progress"],
  in_progress: ["completed"],
  completed: ["archived"],
  archived: [],
};

export function canTransitionResearchActivity(current: string, next: string) {
  return (nextResearchStatus[current] ?? []).includes(next);
}
