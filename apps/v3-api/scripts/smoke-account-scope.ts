import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {config,internalEmail} from '../src/config.js';
import {authProvider} from '../src/runtime/auth-provider.js';

if(!config.isLocalLite) throw new Error('账号权限故障注入验收仅允许本地环境');
const base=(process.argv[2] || 'http://web:8080').replace(/\/$/,'');
const pool=new Pool({connectionString:config.LOCAL_DATABASE_URL});
const stamp=Date.now();const username=`scope.test.${stamp}`;const password='ScopeLocal123!';
const trigger=`account_scope_smoke_${stamp}`;
let userId='',foreignTenantId='',foreignClassId='',researchCookie='',teacherCookie='';
async function call(path:string,cookie:string,init:RequestInit={},expected=200){
  const response=await fetch(base+path,{...init,headers:{Cookie:cookie,...init.headers as Record<string,string>}});
  const data=await response.json().catch(()=>({}));
  assert.equal(response.status,expected,`${path} -> ${response.status} ${JSON.stringify(data)}`);return data;
}
const json=(value:unknown,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function login(username:string,password:string){
  const response=await fetch(base+'/api/auth/login',json({username,password}));assert.equal(response.status,200);
  return response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
}
try{
  researchCookie=await login('research.admin','LocalResearch123!');
  const me=await call('/api/me',researchCookie);
  const classes=(await call('/api/classrooms',researchCookie)).items.filter((item:any)=>item.status === 'active');
  assert.ok(classes.length>=2);const a=classes[0].id,b=classes[1].id;
  const invalid=await call('/api/accounts',researchCookie,json({username,displayName:'虚构账号验收',role:'teacher',password:'lowercase123',classroomIds:[a]}),422);
  assert.ok(invalid.fields.password.some((message:string)=>message.includes('大写字母')));
  assert.equal((await pool.query('select count(*) from auth.users where email=$1',[internalEmail(username)])).rows[0].count,'0');
  const account=await call('/api/accounts',researchCookie,json({username,displayName:'虚构账号验收',role:'teacher',password,classroomIds:[a]}),201);
  userId=account.item.user_id;teacherCookie=await login(username,password);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[a]);
  const updated=await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[b]},'PATCH'));
  assert.deepEqual(updated.item.classroom_ids,[b]);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[b]);
  await call(`/api/accounts/${userId}/classrooms`,teacherCookie,json({classroomIds:[a]},'PATCH'),403);
  await call(`/api/accounts/${me.user.id}/classrooms`,researchCookie,json({classroomIds:[a]},'PATCH'),409);
  await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[a,a]},'PATCH'),422);

  foreignTenantId=(await pool.query('insert into tongji_v3.tenants(code,name) values($1,$2) returning id',[`scope.foreign.${stamp}`,'虚构外园权限验收'])).rows[0].id;
  foreignClassId=(await pool.query("insert into tongji_v3.classrooms(tenant_id,name,grade,academic_year,semester,created_by) values($1,'外园测试班','middle','2026-2027','测试',$2) returning id",[foreignTenantId,me.user.id])).rows[0].id;
  await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[foreignClassId]},'PATCH'),422);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[b]);
  const privilege=await pool.query("select has_function_privilege('authenticated','tongji_v3.set_teacher_classrooms(uuid,uuid,uuid,uuid[])','execute') as allowed");
  assert.equal(privilege.rows[0].allowed,false);

  await pool.query(`create function tongji_v3_private.${trigger}() returns trigger language plpgsql as $$ begin if NEW.action='account.classrooms_updated' and NEW.resource_id='${userId}' then raise exception 'local scope audit fault';end if;return NEW;end;$$;create trigger ${trigger} before insert on tongji_v3.audit_events for each row execute function tongji_v3_private.${trigger}();`);
  await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[a]},'PATCH'),500);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[b]);
  await pool.query(`drop trigger ${trigger} on tongji_v3.audit_events;drop function tongji_v3_private.${trigger}();`);
  await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[]},'PATCH'));
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items,[]);
  await call(`/api/accounts/${userId}/classrooms`,researchCookie,json({classroomIds:[a]},'PATCH'));
}finally{
  await pool.query(`drop trigger if exists ${trigger} on tongji_v3.audit_events;drop function if exists tongji_v3_private.${trigger}();`);
  if(userId){await pool.query('delete from tongji_v3.audit_events where resource_id=$1 or actor_id=$1::uuid',[userId]);await pool.query('delete from tongji_v3.profiles where user_id=$1',[userId]);const {error}=await authProvider.deleteUser(userId);if(error)throw error;}
  if(foreignClassId)await pool.query('delete from tongji_v3.classrooms where id=$1',[foreignClassId]);
  if(foreignTenantId)await pool.query('delete from tongji_v3.tenants where id=$1',[foreignTenantId]);
  await pool.end();
}
console.log('账号真实接口验收通过：密码校验、创建、同一会话权限即时切换、教研全园保护、教师/跨园越权拦截、事务故障回滚、清空范围；临时数据已清理。');
