// Candidate-build acceptance with isolated, fictional fixtures and real production Auth/DB/model.
// Mount the candidate at /verification; never import server.js (its restart recovery is global).
import assert from 'node:assert/strict';
import {randomBytes, createHash} from 'node:crypto';
if (!process.argv.includes('--authorized-production-fixtures')) throw Error('Explicit isolated production-fixture authorization required');
const {config, internalEmail} = await import('/verification/dist/src/config.js');
const {serviceClient} = await import('/verification/dist/src/supabase.js');
const {authProvider} = await import('/verification/dist/src/runtime/auth-provider.js');
const {buildApp} = await import('/verification/dist/src/app.js');
if (config.AI_MODE !== 'qianwen' || config.aiFallbackToSimulated) throw Error('Real model without simulated fallback required');
const {analysisGenerationSchema} = await import('/verification/dist/src/ai/analysis-generation-quality.js');
const db = serviceClient.schema(config.SUPABASE_SCHEMA);
const publicBase = process.argv.find(value => value.startsWith('--public-base='))?.slice('--public-base='.length);
const singleSubject = process.argv.includes('--single-subject');
if (publicBase && publicBase !== 'https://tongji.meidaquan.com') throw Error('Unexpected public verification target');
const app = publicBase ? null : await buildApp();
const base = publicBase ?? await app.listen({port: 0, host: '127.0.0.1'});
const code = `context.acceptance.${Date.now()}`;
let tenant, user, cookie = '', activeJob;
const password = `Aa9!${randomBytes(18).toString('base64url')}`;
async function data(query) {const r = await query; if (r.error) throw Error(r.error.message); return r.data;}
async function insert(table, value) {return data(db.from(table).insert(value).select().single());}
async function snapshot() {
  const tables = {profiles: 'user_id,tenant_id,role,status,display_name', children: 'id,tenant_id,status,guardian_consent_status', ai_model_configs: 'tenant_id,model_key,revision', ai_credential_configs: 'tenant_id,profile,revision', ai_prompt_configs: 'tenant_id,prompt_key,revision', observations: 'id,tenant_id,status,updated_at', analysis_runs: 'id,tenant_id,decision', professional_memories: 'id,tenant_id,status,updated_at'};
  const result = {};
  for (const [table, columns] of Object.entries(tables)) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      let q = db.from(table).select(columns).range(offset, offset + 499);
      if (tenant) q = q.neq('tenant_id', tenant.id);
      const page = await data(q); rows.push(...page); if (page.length < 500) break;
    }
    result[table] = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex');
  }
  return result;
}
const before = await snapshot();
async function call(path, value, expected = 200, method = 'POST') {
  const r = await fetch(base + path, {method, headers: {Cookie: cookie, 'Content-Type': 'application/json'}, ...(value === undefined ? {} : {body: JSON.stringify(value)})});
  const body = await r.json(); assert.equal(r.status, expected, `${path}: ${body.code ?? r.status}`); return body;
}
async function settle(id) {
  const until = Date.now() + 15 * 60 * 1000;
  let previous;
  while (Date.now() < until) {
    const {item} = await call(`/api/analysis-jobs/${id}`, undefined, 200, 'GET');
    if (['completed', 'failed', 'cancelled'].includes(item.status)) return item;
    const state = `${item.stage}:${item.progress}`;
    if (state !== previous) {console.log(JSON.stringify({event: 'api_analysis_progress', state})); previous = state;}
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw Error('Candidate analysis still active; preserve fixtures for investigation');
}
try {
  tenant = await insert('tenants', {code, name: '虚构观察长度修复验收园'});
  const identity = await authProvider.createUser({email: internalEmail(code), password, appMetadata: {application: 'tongji_v3', purpose: 'context_recovery_acceptance'}});
  if (identity.error || !identity.data?.user) throw Error('Isolated identity creation failed');
  user = identity.data.user;
  await insert('profiles', {user_id: user.id, tenant_id: tenant.id, username: code, display_name: '虚构验收教研员', role: 'researcher', status: 'active', created_by: user.id});
  const login = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: code, password})});
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map(item => item.split(';', 1)[0]).join('; ');
  await call('/api/ai-model-config', {model: 'qwen3.7-plus-2026-05-26', expectedRevision: 0}, 200, 'PUT');
  const classroom = (await call('/api/classrooms', {name: '虚构中班', grade: 'middle', academicYear: '2026-2027', semester: '测试'}, 201)).item;
  const children = [];
  for (const [i, name] of (singleSubject ? ['虚构小桥'] : ['虚构小桥', '虚构小木']).entries()) children.push((await call('/api/children', {classroomId: classroom.id, internalCode: `CTX${i}`, displayName: name, birthMonth: '2022-01-01', guardianConsentStatus: 'pending'}, 201)).item);
  for (let i = 0; i < 8; i++) await insert('professional_memories', {tenant_id: tenant.id, memory_type: 'school_knowledge', source_resource_type: 'acceptance', source_resource_id: `${code}-${i}`, title: '虚构园本片段', summary: '建构时保留幼儿选择，按需支持比较桥墩间距。', retrieval_text: '虚构资料：建构材料应供幼儿自主探索，教师按实际需要提供支持。\n'.repeat(800) + '\n桥墩、木板与支撑位置：先观察怎样摆放，幼儿主动求助时用一个问题邀请再次比较。', applicability: {classroomId: classroom.id, themes: ['桥梁']}, quality_score: 0.8, status: 'active', created_by: user.id, approved_by: user.id, approved_at: new Date().toISOString()});
  const teacherObservation = '以下为虚构技术验收记录：虚构小桥把两个桥墩推开，将木板放上后木板落下。他把桥墩移近，再放木板，木板留在桥墩上。他说：“靠近一点试试。”虚构小木递来另一块短木板，先把木板横放在两个桥墩上，再用手指沿着木板移动，随后说：“小车从这边走。”教师在旁保留材料，等待两人继续尝试。';
  const observation = (await call('/api/observations', {classroomId: classroom.id, observerName: '虚构验收教师', occurredAt: '2026-10-20T09:00:00+08:00', scene: '建构区', theme: '虚构桥梁长度修复验收', organizationStage: 'process', observationFocusCategory: 'materials_tools', subjects: children.map((c, i) => ({childId: c.id, role: i ? 'participant' : 'primary', contextualFeature: i ? '递来短木板并指认小车路线。' : '移动桥墩并再次放上木板。', evidenceAnchors: []})), teacherObservation, teacherIdentification: '两名幼儿各有当前直接行为，形成情境内尝试线索，仍需复察。', teacherResponse: {category: 'material', strategy: '保留桥墩与木板，按实际需要支持。', nextObservationFocus: '观察是否再次比较支撑位置或小车路线。'}}, 201)).item;
  activeJob = (await call(`/api/observations/${observation.id}/analyze`, {}, 202)).item.id;
  const job = await settle(activeJob);
  assert.equal(job.status, 'completed', job.error_message); assert.equal(job.stage, 'completed');
  assert.ok(job.subject_results.every(s => s.status === 'completed'));
  const detail = await call(`/api/observations/${observation.id}`, undefined, 200, 'GET');
  assert.equal(detail.item.teacher_observation, teacherObservation); assert.equal(detail.analyses.length, children.length);
  for (const row of detail.analyses) {
    assert.equal(row.provider, 'QianwenAIProvider'); assert.equal(row.prompt_version, 'observation-analysis.qwen.v13'); assert.equal(row.structured_result.responsePlans.length, 3);
    assert.equal(analysisGenerationSchema.safeParse(row.structured_result).success, true, 'Saved prose must contain complete steps/questions, not single characters');
    assert.equal(row.structured_result.analysisScope, 'individual'); assert.ok(row.structured_result.facts.length);
    assert.ok(row.input_snapshot.diagnostics.schoolContextChars <= 8000);
    assert.ok(row.input_snapshot.diagnostics.schoolContextOriginalChars > 100000);
    assert.ok(row.structured_result.facts.every(f => f.evidenceIds.every(id => id === 'teacher-observation')));
    const claims = await data(db.from('analysis_claim_reviews').select('id').eq('tenant_id', tenant.id).eq('analysis_run_id', row.id));
    const plans = await data(db.from('response_plans').select('id').eq('tenant_id', tenant.id).eq('analysis_run_id', row.id));
    assert.ok(claims.length); assert.equal(plans.length, 3);
    await call(`/api/analyses/${row.id}/decision`, {decision: 'adopted', note: '虚构验收记录确认'});
    assert.equal((await call(`/api/children/${row.child_id}/growth`, undefined, 200, 'GET')).timeline.length, 1);
    console.log(JSON.stringify({event: 'full_api_analysis_passed', facts: row.structured_result.facts.length, minStepLength: Math.min(...row.structured_result.responsePlans.flatMap(p => p.activitySupport.steps.map(s => s.trim().length))), minQuestionLength: Math.min(...row.structured_result.responsePlans.flatMap(p => p.experienceSupport.suggestedQuestions.map(s => s.trim().length))), plans: plans.length, claims: claims.length, diagnostics: row.input_snapshot.diagnostics}));
  }
  const exported = await call(`/api/observations/${observation.id}/document-exports`, {variant: 'professional'}, 201);
  const document = await fetch(base + `/api/document-exports/${exported.documentExport.id}/download`, {headers: {Cookie: cookie}});
  assert.equal(document.status, 200);
  const {default: unzipper} = await import('unzipper');
  const zip = await unzipper.Open.buffer(Buffer.from(await document.arrayBuffer()));
  const xml = await zip.files.find(file => file.path === 'word/document.xml').buffer();
  const documentText = xml.toString().replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const exportedSteps = detail.analyses.flatMap(row => row.structured_result.responsePlans.flatMap(plan => plan.activitySupport.steps));
  for (const step of exportedSteps) assert.ok(documentText.includes(step), 'Word must contain complete saved activity steps');
  console.log(JSON.stringify({event: 'candidate_full_flow_passed', realAuth: true, realModel: true, savedResults: detail.analyses.length, savedPlans: detail.analyses.length * 3, adoptionAndGrowth: true, wordExport: true, completeStepsInWord: exportedSteps.length}));
} finally {
  if (activeJob) await settle(activeJob);
  if (tenant) {
    const found = await data(db.from('tenants').select('code').eq('id', tenant.id).single());
    assert.equal(found.code, code);
    const active = await data(db.from('analysis_jobs').select('id').eq('tenant_id', tenant.id).in('status', ['queued', 'processing']));
    assert.equal(active.length, 0, 'Do not clean active tasks');
    const {mediaStorage} = await import('/verification/dist/src/runtime/media-storage.js');
    for (const table of ['document_exports', 'evidence_assets']) for (const item of await data(db.from(table).select('storage_path').eq('tenant_id', tenant.id))) if (item.storage_path) {const {error} = await mediaStorage.remove(item.storage_path); if (error) throw Error(error.message);}
    for (const table of ['professional_memories', 'support_actions', 'response_plans', 'analysis_claim_reviews', 'analysis_runs', 'analysis_jobs', 'document_exports', 'evidence_assets', 'observation_subjects', 'observations', 'ai_model_configs', 'ai_credential_configs', 'ai_prompt_configs', 'children', 'classroom_teachers', 'classrooms', 'audit_events', 'profiles']) await data(db.from(table).delete().eq('tenant_id', tenant.id));
    await data(db.from('tenants').delete().eq('id', tenant.id));
    if (user) {const {error} = await authProvider.deleteUser(user.id); if (error) throw Error(error.message);}
    const after = await snapshot();
    const changed = Object.keys(before).filter(table => before[table] !== after[table]);
    console.log(JSON.stringify({event: 'fixture_cleanup_complete', customerMetadataUnchanged: !changed.length, changedTables: changed}));
    assert.deepEqual(changed, [], 'Concurrent customer changes detected; never restore customer data');
  }
  await app?.close();
}
