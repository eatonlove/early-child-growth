import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {buildApp} from '../src/app.js';
import {config, internalEmail} from '../src/config.js';
import {authProvider} from '../src/runtime/auth-provider.js';
import {serviceClient} from '../src/supabase.js';

if (!config.isLocalLite || config.AI_MODE !== 'simulated') throw new Error('此验收仅允许本地隔离资料与模拟AI');
const pool = new Pool({connectionString: config.LOCAL_DATABASE_URL});
const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
const app = await buildApp();
const base = await app.listen({port: 0, host: '127.0.0.1'});
const stamp = Date.now(), password = `Aa9!${randomBytes(12).toString('base64url')}`;
const tenants: string[] = [], users: string[] = [];
let passed = false;
async function insert(table: string, value: Record<string, unknown>) {
  const {data, error} = await schema.from(table).insert(value).select().single();
  if (error) throw new Error(`${table}: ${error.message}`); return data;
}
const json = (value: unknown, method = 'POST') => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
async function call(path: string, cookie: string, init: RequestInit = {}, expected = 200) {
  const response = await fetch(base + path, {...init, headers: {Cookie: cookie, ...init.headers as Record<string, string>}});
  const data = await response.json(); assert.equal(response.status, expected, `${path} status ${response.status}: ${JSON.stringify(data)}`); return data;
}
async function identity(tenantId: string, username: string, role: 'teacher' | 'researcher') {
  const {data, error} = await authProvider.createUser({email: internalEmail(username), password, appMetadata: {application: 'tongji_v3', purpose: 'subject_evidence_local_smoke'}});
  if (error || !data?.user) throw new Error('临时本地身份创建失败');
  users.push(data.user.id);
  await insert('profiles', {user_id: data.user.id, tenant_id: tenantId, username, display_name: '虚构验收教师', role, status: 'active', created_by: data.user.id});
  const response = await fetch(base + '/api/auth/login', json({username, password}));
  assert.equal(response.status, 200); const cookie = response.headers.getSetCookie().map(item => item.split(';', 1)[0]).join('; ');
  return {id: data.user.id, cookie};
}
async function waitJob(id: string, cookie: string) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const {item} = await call(`/api/analysis-jobs/${id}`, cookie);
    if (['completed', 'failed'].includes(item.status)) return item;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('本地后台任务未及时完成');
}
try {
  const tenant = await insert('tenants', {code: `subject.evidence.${stamp}`, name: '虚构逐名证据验收园'}); tenants.push(tenant.id);
  const foreign = await insert('tenants', {code: `subject.foreign.${stamp}`, name: '虚构外园'}); tenants.push(foreign.id);
  const admin = await identity(tenant.id, `se.admin.${stamp}`, 'researcher');
  const teacher = await identity(tenant.id, `se.teacher.${stamp}`, 'teacher');
  const other = await identity(tenant.id, `se.other.${stamp}`, 'teacher');
  const foreignAdmin = await identity(foreign.id, `se.foreign.${stamp}`, 'researcher');
  const classroom = (await call('/api/classrooms', admin.cookie, json({name: '虚构验收班', grade: 'middle', academicYear: '2026-2027', semester: '测试'}), 201)).item;
  await insert('classroom_teachers', {tenant_id: tenant.id, classroom_id: classroom.id, user_id: teacher.id, assigned_by: admin.id});
  await insert('classroom_teachers', {tenant_id: tenant.id, classroom_id: classroom.id, user_id: other.id, assigned_by: admin.id});
  const child = async (name: string, code: string) => (await call('/api/children', teacher.cookie, json({classroomId: classroom.id, internalCode: code, displayName: name, birthMonth: '2022-01-01', guardianConsentStatus: 'pending'}), 201)).item;
  const a = await child('幼儿甲', 'A'), b = await child('幼儿乙', 'B');
  const input = {classroomId: classroom.id, observerName: '虚构验收教师', subjects: [{childId: a.id, role: 'primary', contextualFeature: '', evidenceAnchors: []}, {childId: b.id, role: 'participant', contextualFeature: '', evidenceAnchors: []}], occurredAt: '2026-10-14T09:00:00+08:00', scene: '建构区', theme: '搭桥', organizationStage: 'process', observationFocusCategory: 'materials_tools', teacherObservation: '幼儿甲移动桥墩后再次推车，桥面没有滑落，又把桥墩移回原处尝试。', teacherIdentification: '幼儿甲出现比较支撑位置的线索。', teacherResponse: {category: 'material', strategy: '保留现有材料等待再次尝试。', nextObservationFocus: '观察幼儿如何比较支撑位置。'}};
  const observation = (await call('/api/observations', teacher.cookie, json(input), 201)).item;
  const job = (await call(`/api/observations/${observation.id}/analyze`, teacher.cookie, json({}), 202)).item;
  const initial = await waitJob(job.id, teacher.cookie);
  assert.equal(initial.status, 'completed'); assert.equal(initial.stage, 'completed');
  assert.equal(initial.subject_results.find((item: any) => item.childId === a.id).status, 'completed');
  assert.equal(initial.subject_results.find((item: any) => item.childId === a.id).analysisScope, 'individual');
  const contextSubject = initial.subject_results.find((item: any) => item.childId === b.id);
  assert.equal(contextSubject.status, 'completed'); assert.equal(contextSubject.analysisScope, 'context_only');
  assert(contextSubject.missingInformation.length > 0);
  assert.equal(initial.analysis_run_ids.length, 2);
  const firstRun = initial.subject_results.find((item: any) => item.childId === a.id).analysisRunId;
  await call(`/api/analyses/${firstRun}/decision`, teacher.cookie, json({decision: 'adopted'}));
  await call(`/api/analyses/${contextSubject.analysisRunId}/decision`, teacher.cookie, json({decision: 'adopted'}));
  const growthA = await call(`/api/children/${a.id}/growth`, teacher.cookie);
  const growthB = await call(`/api/children/${b.id}/growth`, teacher.cookie);
  assert.equal(growthA.timeline.length, 1); assert.equal(growthB.timeline.length, 0);
  const secondObservation = (await call('/api/observations', teacher.cookie, json({...input, occurredAt: '2026-10-13T09:00:00+08:00'}), 201)).item;
  const secondJob = (await call(`/api/observations/${secondObservation.id}/analyze`, teacher.cookie, json({}), 202)).item;
  const second = await waitJob(secondJob.id, teacher.cookie);
  await call(`/api/analyses/${second.subject_results.find((item: any) => item.childId === a.id).analysisRunId}/decision`, teacher.cookie, json({decision: 'adopted'}));
  const reportInput = {classroomId: classroom.id, reportType: 'teacher', periodStart: '2026-10-13', periodEnd: '2026-10-14'};
  const reportA = (await call('/api/reports/generate', teacher.cookie, json({...reportInput, childId: a.id}), 201)).item;
  assert.equal(reportA.evidence_observation_ids.length, 2);
  await call('/api/reports/generate', teacher.cookie, json({...reportInput, childId: b.id}), 409);
  await call('/api/reports/generate', teacher.cookie, json({...reportInput, reportType: 'classroom'}), 409);
  await call('/api/curriculum-clues/from-evidence', teacher.cookie, json({classroomId: classroom.id, observationIds: [observation.id, secondObservation.id]}), 409);

  const detail = await call(`/api/observations/${observation.id}`, teacher.cookie);
  assert.equal(detail.analyses.length, 2); assert.equal(detail.analysisSubjectResults.length, 2);
  const context = detail.analyses.find((item: any) => item.child_id === b.id).structured_result;
  assert.equal(context.analysisScope, 'context_only'); assert.equal(context.facts.length, 0);
  assert.equal(context.developmentReferences.length, 0); assert.equal(context.responsePlans.length, 3);
  const supplement = {additionalObservation: '幼儿乙把木板转向后推车尝试，发现桥面滑落，又将木板换回原方向。', contextualFeature: '蓝色上衣，画面右侧', evidenceAnchors: []};
  await call(`/api/observations/${observation.id}/subjects/${b.id}/supplement`, other.cookie, json(supplement, 'PATCH'), 403);
  await call(`/api/observations/${observation.id}/subjects/${b.id}/supplement`, foreignAdmin.cookie, json(supplement, 'PATCH'), 404);
  const active = await insert('analysis_jobs', {tenant_id: tenant.id, classroom_id: classroom.id, observation_id: observation.id, requested_by: teacher.id, status: 'processing', stage: 'analyzing_subject', subject_results: [{childId: b.id, status: 'processing', explanation: '', missingInformation: [], analysisRunId: null}]});
  await call(`/api/observations/${observation.id}/subjects/${b.id}/supplement`, teacher.cookie, json(supplement, 'PATCH'), 409);
  const {error: cancelError} = await schema.from('analysis_jobs').update({status: 'cancelled'}).eq('id', active.id); assert.ifError(cancelError);
  await call(`/api/observations/${observation.id}/subjects/${b.id}/supplement`, teacher.cookie, json(supplement, 'PATCH'));
  await call(`/api/observations/${observation.id}/analyze`, teacher.cookie, json({childIds: [a.id, a.id]}), 422);
  const retry = (await call(`/api/observations/${observation.id}/analyze`, teacher.cookie, json({childIds: [b.id]}), 202)).item;
  const retried = await waitJob(retry.id, teacher.cookie);
  assert.equal(retried.status, 'completed'); assert.equal(retried.subject_results.length, 1);
  assert.equal(retried.subject_results[0].childId, b.id); assert.equal(retried.subject_results[0].status, 'completed');
  const refreshed = await call(`/api/observations/${observation.id}`, teacher.cookie);
  assert.equal(refreshed.analyses.length, 3); assert(refreshed.analyses.some((item: any) => item.id === firstRun));
  assert.equal(refreshed.analyses.find((item: any) => item.id === retried.analysis_run_ids[0]).structured_result.analysisScope, 'individual');
  assert.equal(refreshed.item.teacher_observation, input.teacherObservation);
  assert.equal(refreshed.analysisSubjectResults.filter((item: any) => item.status === 'completed').length, 2);
  // The new draft for B makes the parent ai_ready; A's adopted evidence must remain official.
  assert.equal(refreshed.item.status, 'ai_ready');
  assert.equal((await call(`/api/children/${a.id}/growth`, teacher.cookie)).timeline.length, 2);
  assert.equal((await call(`/api/children/${b.id}/growth`, teacher.cookie)).timeline.length, 0);
  const reportsAfter = await call(`/api/reports?childId=${a.id}`, teacher.cookie);
  assert(reportsAfter.items.some((item: any) => item.id === reportA.id && item.evidence_observation_ids.length === 2));
  await call('/api/reports/generate', teacher.cookie, json({...reportInput, childId: a.id}), 201);
  await call('/api/reports/generate', teacher.cookie, json({...reportInput, childId: b.id}), 409);

  const allSparse = (await call('/api/observations', teacher.cookie, json({...input, teacherObservation: '几名幼儿共同在建构区游戏，教师在旁边观察。'}), 201)).item;
  const sparseJob = (await call(`/api/observations/${allSparse.id}/analyze`, teacher.cookie, json({}), 202)).item;
  const sparse = await waitJob(sparseJob.id, teacher.cookie);
  assert.equal(sparse.status, 'completed'); assert.equal(sparse.stage, 'completed'); assert.equal(sparse.analysis_run_ids.length, 2);
  assert(sparse.subject_results.every((item: any) => item.status === 'completed' && item.analysisScope === 'context_only' && item.missingInformation.length));
  const punctuationRun = retried.analysis_run_ids[0];
  const original = refreshed.analyses.find((item: any) => item.id === punctuationRun).structured_result;
  const invalid = structuredClone(original); invalid.responsePlans[0].activitySupport.steps = Array(8).fill(','); invalid.responsePlans[0].experienceSupport.suggestedQuestions = Array(8).fill(',');
  const {error: updateError} = await schema.from('analysis_runs').update({structured_result: invalid}).eq('id', punctuationRun); assert.ifError(updateError);
  await call(`/api/analyses/${punctuationRun}/decision`, teacher.cookie, json({decision: 'adopted'}), 409);
  const {error: restoreError} = await schema.from('analysis_runs').update({structured_result: original}).eq('id', punctuationRun); assert.ifError(restoreError);
  passed = true;
  console.log('PASS: incomplete material generates context analysis and optional notes, no preflight blocking, no context-only personal growth/report eligibility, targeted supplement upgrades B to individual draft, preserved A results/reports, authorization/active-task checks, punctuation adoption rejection, all-sparse observations produce support drafts.');
} finally {
  for (const tenantId of tenants.reverse()) {
    await pool.query('delete from tongji_v3.audit_events where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.period_reports where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.professional_memories where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.observations where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.children where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.classroom_teachers where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.classrooms where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.profiles where tenant_id=$1', [tenantId]);
    await pool.query('delete from tongji_v3.tenants where id=$1', [tenantId]);
  }
  for (const userId of users) {const {error} = await authProvider.deleteUser(userId); if (error) throw new Error('本地验收身份清理失败');}
  await app.close(); await pool.end();
}
process.exit(passed ? 0 : 1);
