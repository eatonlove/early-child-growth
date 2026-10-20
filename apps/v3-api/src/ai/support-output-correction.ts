import { z } from 'zod';

type Schema = Record<string, any>;
type Path = Array<string | number>;
const own = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function at(root: any, path: Path): any { return path.reduce((value, key) => value?.[key], root); }
function schemaAt(root: Schema, path: Path): Schema | undefined {
  let schema = root;
  for (const key of path) {
    schema = typeof key === 'number' ? schema?.items : schema?.properties?.[key];
    if (!schema) return;
  }
  return schema;
}
function validator(schema: Schema): z.ZodTypeAny | undefined {
  if (schema.type === 'string') {
    let value = z.string().trim().min(Math.max(2, schema.minLength ?? 1)).max(schema.maxLength ?? 2000);
    if (schema.pattern) value = value.regex(new RegExp(schema.pattern, 'u'));
    return value.refine(text => /\p{L}/u.test(text), '必须写完整文字，不能仅包含标点或数字');
  }
  if (schema.type === 'array' && schema.items?.type === 'string') {
    const item = validator(schema.items);
    if (item) return z.array(item).min(schema.minItems ?? 0).max(schema.maxItems ?? 20);
  }
}

/** Allow only future support fields. Current observations and experience judgments stay byte-for-byte intact. */
export function supportCorrection(draft: unknown, issues: z.ZodIssue[], jsonSchema: Schema) {
  if (!own(draft) || !Array.isArray(draft.responsePlans) || !issues.length || issues.length > 500) return;
  const paths: Path[] = [];
  for (const issue of issues) {
    let path = issue.path;
    if (path[0] !== 'responsePlans' || typeof path[1] !== 'number' || path.length < 3 || path.includes('evidenceIds') || path.some(key => ['__proto__', 'prototype', 'constructor'].includes(String(key)))) return;
    const schema = schemaAt(jsonSchema, path);
    if (!schema || !validator(schema) || !['too_small', 'too_big', 'invalid_type', 'custom', 'invalid_string'].includes(issue.code)) return;
    // Repair a list together so several bad steps/questions do not become many isolated fragments.
    if (typeof path.at(-1) === 'number' && schemaAt(jsonSchema, path.slice(0, -1))?.items?.type === 'string') path = path.slice(0, -1);
    if (!paths.some(existing => JSON.stringify(existing) === JSON.stringify(path))) paths.push([...path]);
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties: Schema = {};
  const fields = paths.map((path, index) => {
    const key = `fix${index}`;
    const schema = schemaAt(jsonSchema, path)!;
    shape[key] = validator(schema)!;
    properties[key] = {...schema, ...(schema.type === 'string' ? {minLength: Math.max(2, schema.minLength ?? 1)} : {}), description: `只修正 ${path.join('.')}，用完整中文词组或短句，不用首字占位。`};
    return {key, path: path.join('.'), currentValue: at(draft, path), minimum: schema.minLength ?? schema.minItems, maximum: schema.maxLength ?? schema.maxItems, type: schema.type};
  });
  return {
    jsonSchema: {type: 'object', additionalProperties: false, required: fields.map(field => field.key), properties},
    validator: z.object(shape).strict(),
    instruction: `上一份JSON未通过严格业务Schema校验。只修正下列未来支持字段，不重新生成整份分析，不修改事实、证据ID或经验判断。每项返回完整短句，不能缩写成首字；保留教师观察的安全边界。按fix键返回JSON对象，不输出其他字段。\n${JSON.stringify({fields, supportedContext: {objectiveSummary: draft.objectiveSummary, responsePlans: draft.responsePlans}})}`,
    apply(patches: Record<string, unknown>): unknown {
      const output = structuredClone(draft);
      paths.forEach((path, index) => {
        const parent = at(output, path.slice(0, -1));
        if (!parent || !Object.hasOwn(patches, `fix${index}`)) throw new Error('定向纠错字段缺失');
        parent[path.at(-1)!] = patches[`fix${index}`];
      });
      return output;
    },
    paths: paths.map(path => path.join('.')),
  };
}
