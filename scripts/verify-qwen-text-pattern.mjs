// Stateless provider diagnostic with fictional prose only. No business writes or credential output.
import assert from 'node:assert/strict';
if (!process.argv.includes('--allow-production-readonly')) throw Error('Explicit production read-only verification flag required');
const {config} = await import('/verification/dist/src/config.js');
const {analysisJsonSchema} = await import('/verification/dist/src/ai/json-schemas.js');
const expected = {steps: ['教师先观察幼儿怎样调整木板的位置。', '幼儿主动求助时再询问他准备怎样尝试。'], timing: '幼儿主动求助或持续受阻时再介入。'};
const productionItem = analysisJsonSchema.properties.responsePlans.items.properties.activitySupport.properties.steps.items;
assert.equal(Object.hasOwn(productionItem, 'pattern'), false);
for (const [variant, pattern] of [['old-pattern', '[A-Za-z\\u3400-\\u9FFF]'], ['production-without-pattern', null]]) {
  const item = {type: 'string', minLength: 1, maxLength: 200, ...(pattern ? {pattern} : {})};
  const schema = {type: 'object', additionalProperties: false, required: ['steps', 'timing'], properties: {steps: {type: 'array', minItems: 2, maxItems: 2, items: item}, timing: {type: 'string', minLength: 2, maxLength: 200}}};
  const start = Date.now();
  const response = await fetch(config.QWEN_BASE_URL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', headers: {Authorization: `Bearer ${config.qwenApiKeys.YT}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'qwen3.7-plus-2026-05-26', enable_thinking: false, temperature: 0, messages: [{role: 'user', content: '请原样返回以下JSON，不要删字，不要改写：' + JSON.stringify(expected)}], response_format: {type: 'json_schema', json_schema: {name: 'tongji_pattern_diagnostic', strict: true, schema}}}),
    signal: AbortSignal.timeout(55000),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const content = JSON.parse(payload.choices[0].message.content);
  if (variant !== 'old-pattern') assert.deepEqual(content, expected);
  console.log(JSON.stringify({variant, elapsedMs: Date.now() - start, content, finishReason: payload.choices[0].finish_reason}));
}
