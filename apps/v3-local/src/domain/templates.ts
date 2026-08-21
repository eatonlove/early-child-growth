import type { ObservationFocus } from "./types";

export function recommendObservationFocus(scene: string, purpose: string, focuses: ObservationFocus[]) {
  const keywords = `${scene}${purpose}`;
  const preferred = focuses.filter((focus) =>
    (/角色|合作|规则/.test(keywords) && /同伴|表达/.test(focus.name)) ||
    (/建构|沙水|科学|问题/.test(keywords) && /问题|材料|持续/.test(focus.name)),
  );
  return preferred.length ? preferred : focuses.filter((focus) => focus.group === "通用维度");
}
