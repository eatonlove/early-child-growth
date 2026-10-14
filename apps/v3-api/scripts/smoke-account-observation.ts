import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {config,internalEmail} from '../src/config.js';
import {authProvider} from '../src/runtime/auth-provider.js';
import {mediaStorage} from '../src/runtime/media-storage.js';
import {serviceClient} from '../src/supabase.js';

if(!config.isLocalLite && !process.argv.includes('--authorized-production-fixtures')) throw new Error('生产写入验收需要明确授权');
const base=(process.argv[2] || 'http://web:8080').replace(/\/$/,'');
if(!config.isLocalLite && !base.startsWith('https://')) throw new Error('生产验收必须使用HTTPS');
const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
const stamp=Date.now(),password=`Aa9!${randomBytes(18).toString('base64url')}`;
const tenantIds:string[]=[],userIds:string[]=[],storagePaths:string[]=[];
const pool=config.isLocalLite ? new Pool({connectionString:config.LOCAL_DATABASE_URL}) : null;
const trigger=`account_observation_acceptance_${stamp}`;
async function insert(table:string,value:Record<string,unknown>) {
  const {data,error}=await schema.from(table).insert(value).select().single();
  if(error) throw new Error(`${table}: ${error.message}`);return data;
}
async function call(path:string,cookie:string,init:RequestInit={},expected=200) {
  const response=await fetch(base+path,{...init,headers:{Cookie:cookie,...init.headers as Record<string,string>}});
  const data=await response.json().catch(()=>({}));
  assert.equal(response.status,expected,`${path} -> ${response.status}: ${JSON.stringify(data)}`);return data;
}
const json=(value:unknown,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function login(username:string) {
  const response=await fetch(base+'/api/auth/login',json({username,password}));
  assert.equal(response.status,200);
  return response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
}
async function identity(tenantId:string,username:string,role:'teacher'|'researcher') {
  const {data,error}=await authProvider.createUser({email:internalEmail(username),password,appMetadata:{application:'tongji_v3',purpose:'account_observation_acceptance'}});
  if(error || !data?.user) throw new Error(error?.message || '临时身份创建失败');
  userIds.push(data.user.id);
  await insert('profiles',{user_id:data.user.id,tenant_id:tenantId,username,display_name:'虚构验收账号',role,status:'active',created_by:data.user.id});
  return data.user.id;
}
try {
  const tenant=await insert('tenants',{code:`account.observation.smoke.${stamp}`,name:'虚构账号与观察验收园'});tenantIds.push(tenant.id);
  const foreign=await insert('tenants',{code:`account.observation.foreign.${stamp}`,name:'虚构外园验收'});tenantIds.push(foreign.id);
  const adminUsername=`ao.admin.${stamp}`,foreignUsername=`ao.foreign.${stamp}`;
  const adminId=await identity(tenant.id,adminUsername,'researcher');
  const foreignId=await identity(foreign.id,foreignUsername,'researcher');
  const adminCookie=await login(adminUsername),foreignCookie=await login(foreignUsername);
  const classroom=(await call('/api/classrooms',adminCookie,json({name:'虚构验收班',grade:'middle',academicYear:'2026-2027',semester:'测试'}),201)).item;
  const teacherUsername=`ao.teacher.${stamp}`,otherUsername=`ao.other.${stamp}`;
  const teacher=(await call('/api/accounts',adminCookie,json({username:teacherUsername,displayName:'虚构老师',role:'teacher',password,classroomIds:[classroom.id]}),201)).item;userIds.push(teacher.user_id);
  const other=(await call('/api/accounts',adminCookie,json({username:otherUsername,displayName:'虚构同班教师',role:'teacher',password,classroomIds:[classroom.id]}),201)).item;userIds.push(other.user_id);
  const teacherCookie=await login(teacherUsername),otherCookie=await login(otherUsername);
  const renamed=await call(`/api/accounts/${teacher.user_id}/display-name`,adminCookie,json({displayName:'  虚构新名称  '},'PATCH'));
  assert.equal(renamed.item.display_name,'虚构新名称');assert.equal(renamed.item.username,teacherUsername);
  assert.equal(renamed.item.role,'teacher');assert.deepEqual(renamed.item.classroom_ids,[classroom.id]);
  assert.equal((await call('/api/me',teacherCookie)).user.displayName,'虚构新名称');
  await call(`/api/accounts/${teacher.user_id}/display-name`,teacherCookie,json({displayName:'不能自行改名'},'PATCH'),403);
  await call(`/api/accounts/${foreignId}/display-name`,adminCookie,json({displayName:'不能跨园改名'},'PATCH'),404);
  await call(`/api/accounts/${teacher.user_id}/display-name`,adminCookie,json({displayName:'   '},'PATCH'),422);
  await call(`/api/accounts/${teacher.user_id}/display-name`,adminCookie,json({displayName:'新名字',role:'researcher'},'PATCH'),422);
  await call(`/api/accounts/${adminId}/display-name`,adminCookie,json({displayName:'虚构新教研员'},'PATCH'));
  assert.equal((await call('/api/me',adminCookie)).user.role,'researcher');
  assert.equal((await call('/api/classrooms',adminCookie)).items.length,1);

  const child=(await call('/api/children',teacherCookie,json({classroomId:classroom.id,internalCode:'TEST01',displayName:'虚构验收幼儿',birthMonth:'2022-01-01',guardianConsentStatus:'pending'}),201)).item;
  const input={classroomId:classroom.id,observerName:'原始观察者快照',subjects:[{childId:child.id,role:'primary',contextualFeature:'',evidenceAnchors:[]}],occurredAt:'2026-10-14T09:00:00+08:00',scene:'建构区',theme:'虚构删除验收',organizationStage:'process',observationFocusCategory:'materials_tools',teacherObservation:'虚构幼儿调整积木的位置后再次测试桥面。',teacherIdentification:'出现对支撑位置的比较线索。',teacherResponse:{category:'material',strategy:'提供不同材料',nextObservationFocus:'继续观察比较材料的方式'}};
  const invalid=await call('/api/observations',teacherCookie,json({...input,teacherResponse:{...input.teacherResponse,strategy:'字'.repeat(2001)}}),422);
  assert.ok(invalid.fields.teacherResponse.some((message:string)=>message.includes('2000')));
  const observation=(await call('/api/observations',teacherCookie,json(input),201)).item;
  assert.equal(observation.observer_name_snapshot,'原始观察者快照');
  assert.equal((await call(`/api/observations/${observation.id}`,teacherCookie)).canDelete,true);
  assert.equal((await call(`/api/observations/${observation.id}`,otherCookie)).canDelete,false);
  await call(`/api/observations/${observation.id}`,otherCookie,{method:'DELETE'},403);
  await call(`/api/observations/${observation.id}`,foreignCookie,{method:'DELETE'},404);

  const common={tenant_id:tenant.id,classroom_id:classroom.id,child_id:child.id,observation_id:observation.id,created_by:teacher.user_id};
  const job=await insert('analysis_jobs',{tenant_id:tenant.id,classroom_id:classroom.id,observation_id:observation.id,requested_by:teacher.user_id,status:'queued',stage:'queued'});
  const active=await call(`/api/observations/${observation.id}`,teacherCookie,{method:'DELETE'},409);assert.equal(active.code,'OBSERVATION_ANALYSIS_ACTIVE');
  const {error:jobError}=await schema.from('analysis_jobs').delete().eq('id',job.id);if(jobError)throw jobError;
  const report=await insert('period_reports',{tenant_id:tenant.id,classroom_id:classroom.id,child_id:child.id,created_by:teacher.user_id,report_type:'teacher',period_start:'2026-10-01',period_end:'2026-10-14',content:{},evidence_observation_ids:[observation.id]});
  const referenced=await call(`/api/observations/${observation.id}`,teacherCookie,{method:'DELETE'},409);assert.equal(referenced.code,'OBSERVATION_USED_IN_REPORT');
  const {error:reportError}=await schema.from('period_reports').delete().eq('id',report.id);if(reportError)throw reportError;
  const clue=await insert('curriculum_clues',{tenant_id:tenant.id,classroom_id:classroom.id,created_by:teacher.user_id,title:'虚构课程线索',theme:'测试',origin:'测试',evidence_observation_ids:[observation.id]});
  const curriculum=await call(`/api/observations/${observation.id}`,teacherCookie,{method:'DELETE'},409);assert.equal(curriculum.code,'OBSERVATION_USED_IN_CURRICULUM');
  const {error:clueError}=await schema.from('curriculum_clues').delete().eq('id',clue.id);if(clueError)throw clueError;

  const bytes=Buffer.from('%PDF-1.4\n% fictional acceptance attachment\n%%EOF');
  const ticket=await call(`/api/observations/${observation.id}/evidence-ticket`,teacherCookie,json({fileName:'虚构验收附件.pdf',mimeType:'application/pdf',sizeBytes:bytes.length}),201);
  const uploaded=await call(ticket.uploadPath,teacherCookie,{method:'POST',headers:{'Content-Type':'application/x-tongji-evidence-stream'},body:bytes as unknown as BodyInit});storagePaths.push(uploaded.item.storage_path);
  assert.equal(uploaded.item.upload_status,'ready');
  const exported=await call(`/api/observations/${observation.id}/document-exports`,teacherCookie,json({variant:'teacher'}),201);
  assert.equal(exported.documentExport.status,'ready');
  storagePaths.push(exported.documentExport.storage_path);
  const {created_by:_createdBy,...analysisCommon}=common;
  const analysis=await insert('analysis_runs',{...analysisCommon,generated_by:teacher.user_id,provider:'acceptance-fixture',model:'fixture-not-real-ai',prompt_version:'fixture',knowledge_version:'fixture',input_snapshot:{},structured_result:{},decision:'adopted'});
  await insert('analysis_claim_reviews',{...analysisCommon,analysis_run_id:analysis.id,claim_key:'test',claim_type:'objective_summary',original_content:{content:'虚构测试事实'}});
  await insert('response_plans',{...common,analysis_run_id:analysis.id,title:'虚构支持',rationale:'虚构依据',activity_support:{},material_support:{},experience_support:{},observation_cut:'测试',adjustment_condition:'测试'});
  await insert('support_actions',{...common,analysis_run_id:analysis.id,category:'material',rationale:'虚构依据',strategy:'虚构材料支持',next_observation_focus:'虚构复察'});
  await insert('professional_memories',{tenant_id:tenant.id,memory_type:'teacher_feedback',source_resource_type:'analysis_run',source_resource_id:analysis.id,title:'虚构经验',summary:'测试',retrieval_text:'测试',applicability:{observationId:observation.id},created_by:teacher.user_id});
  const imported=await insert('observation_imports',{tenant_id:tenant.id,classroom_id:classroom.id,observation_id:observation.id,source_file_name:'虚构模板.docx',source_mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',source_size_bytes:1,status:'confirmed',created_by:teacher.user_id});
  if(pool) {
    await pool.query(`create function tongji_v3_private.${trigger}() returns trigger language plpgsql as $$ begin
      if NEW.tenant_id='${tenant.id}' and NEW.action in ('account.display_name_updated','observation.deleted') then raise exception 'local acceptance audit fault';end if;return NEW;end;$$;
      create trigger ${trigger} before insert on tongji_v3.audit_events for each row execute function tongji_v3_private.${trigger}();`);
    await call(`/api/accounts/${teacher.user_id}/display-name`,adminCookie,json({displayName:'不应保存的名字'},'PATCH'),500);
    assert.equal((await call('/api/me',teacherCookie)).user.displayName,'虚构新名称');
    await call(`/api/observations/${observation.id}`,teacherCookie,{method:'DELETE'},500);
    for(const table of ['observations','analysis_runs','evidence_assets','response_plans']) {
      const {count,error}=await schema.from(table).select('id',{count:'exact',head:true}).eq('tenant_id',tenant.id);
      if(error)throw error;assert.equal(count,1,`${table} must survive an audit failure`);
    }
    assert.ok((await mediaStorage.download(uploaded.item.storage_path)).data);
    await pool.query(`drop trigger ${trigger} on tongji_v3.audit_events;drop function tongji_v3_private.${trigger}();`);
  }
  const removed=await call(`/api/observations/${observation.id}`,teacherCookie,{method:'DELETE'});assert.equal(removed.ok,true);assert.equal(removed.warning,null);
  await call(`/api/observations/${observation.id}`,teacherCookie,{},404);
  assert.equal((await call('/api/observations',teacherCookie)).items.length,0);
  for(const table of ['observation_subjects','evidence_assets','analysis_runs','analysis_claim_reviews','response_plans','support_actions','professional_memories','document_exports']) {
    const {count,error}=await schema.from(table).select('id',{count:'exact',head:true}).eq('tenant_id',tenant.id);
    if(error)throw error;assert.equal(count,0,`${table} did not cascade`);
  }
  const {data:importAfter,error:importError}=await schema.from('observation_imports').select('status,observation_id').eq('id',imported.id).single();if(importError)throw importError;
  assert.equal(importAfter.status,'needs_review');assert.equal(importAfter.observation_id,null);
  assert.equal((await mediaStorage.download(uploaded.item.storage_path)).data,null);
  assert.equal((await mediaStorage.download(exported.documentExport.storage_path)).data,null);
  const {data:audit,error:auditError}=await schema.from('audit_events').select('detail').eq('tenant_id',tenant.id).eq('action','observation.deleted').single();if(auditError)throw auditError;
  assert.deepEqual(audit.detail.pendingStoragePaths,[]);
  const adminObservation=(await call('/api/observations',teacherCookie,json({...input,theme:'虚构教研员删除验收'}),201)).item;
  // Corrupt fixture metadata must never delete an object from another observation.
  const protectedPath=uploaded.item.storage_path;
  const {error:protectedUploadError}=await mediaStorage.upload(protectedPath,bytes,{contentType:'application/pdf',upsert:false});if(protectedUploadError)throw protectedUploadError;
  await insert('evidence_assets',{tenant_id:tenant.id,classroom_id:classroom.id,child_id:child.id,observation_id:adminObservation.id,evidence_type:'document',storage_path:protectedPath,file_name:'错误路径验收.pdf',mime_type:'application/pdf',size_bytes:bytes.length,upload_status:'ready',created_by:teacher.user_id});
  const protectedDeletion=await call(`/api/observations/${adminObservation.id}`,adminCookie,{method:'DELETE'});
  assert.ok(protectedDeletion.warning);assert.ok((await mediaStorage.download(protectedPath)).data);
  console.log('真实接口验收通过：名称即时更新、角色/范围不变、观察字段错误、本人/教研员删除、同班非创建者/跨园拦截、活动任务与报告/课程引用保护、分析和应答级联、附件及Word清理、非法附件路径保护、模板回到校对。本地另验证审计故障的原子回滚。未调用或切换AI。');
} finally {
  if(pool) {
    try {await pool.query(`drop trigger if exists ${trigger} on tongji_v3.audit_events;drop function if exists tongji_v3_private.${trigger}();`);}
    finally {await pool.end();}
  }
  for(const path of storagePaths) await mediaStorage.remove(path);
  for(const tenantId of tenantIds) {
    for(const table of ['period_reports','curriculum_clues','professional_memories','support_actions','response_plans','analysis_claim_reviews','analysis_jobs','analysis_runs','document_exports','evidence_assets','observation_subjects','observation_imports','observations','children','classroom_teachers','classrooms','audit_events','profiles']) {
      const {error}=await schema.from(table).delete().eq('tenant_id',tenantId);if(error)throw new Error(`${table}清理失败: ${error.message}`);
    }
    const {error}=await schema.from('tenants').delete().eq('id',tenantId);if(error)throw error;
  }
  for(const id of userIds.reverse()) {const {error}=await authProvider.deleteUser(id);if(error)throw error;}
  console.log('隔离验收园所、虚构账号、幼儿、观察和附件已清理。');
}
