import { AI_PROMPT_DEFINITIONS, type AIPromptKey } from "./qianwen-provider.js";

export interface AIPromptConfigRow {
  id: string;
  prompt_key: string;
  custom_prompt: string;
  base_prompt_version: string;
  revision: number;
  change_note: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AIPromptConfigView {
  key: AIPromptKey;
  name: string;
  category: string;
  description: string;
  defaultVersion: string;
  effectiveVersion: string;
  source: "default" | "custom";
  revision: number;
  defaultPrompt: string;
  customPrompt: string | null;
  effectivePrompt: string;
  basePromptVersion: string;
  baseVersionOutdated: boolean;
  changeNote: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

const customVersion = (key: string, revision: number, baseVersion: string) =>
  `custom.${key}.r${revision}@${baseVersion}`;

export function promptView(key: AIPromptKey, row?: AIPromptConfigRow | null): AIPromptConfigView {
  const definition = AI_PROMPT_DEFINITIONS[key];
  return {
    key,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    defaultVersion: definition.defaultVersion,
    effectiveVersion: row ? customVersion(key, row.revision, row.base_prompt_version) : definition.defaultVersion,
    source: row ? "custom" : "default",
    revision: row?.revision ?? 0,
    defaultPrompt: definition.defaultSystemPrompt,
    customPrompt: row?.custom_prompt ?? null,
    effectivePrompt: row?.custom_prompt ?? definition.defaultSystemPrompt,
    basePromptVersion: row?.base_prompt_version ?? definition.defaultVersion,
    baseVersionOutdated: Boolean(row && row.base_prompt_version !== definition.defaultVersion),
    changeNote: row?.change_note ?? "",
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  };
}
