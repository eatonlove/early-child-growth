import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {config,internalEmail} from '../src/config.js';
import {authProvider} from '../src/runtime/auth-provider.js';
import {serviceClient} from '../src/supabase.js';

if(config.isLocalLite || !process.argv.includes('--authorized-production-fixtures')) throw new Error('生产账号验收必须明确授权，且不能用于本地环境');
const base=process.argv[2]?.replace(/\/$/,'');if(!base?.startsWith('https://'))throw new Error('请提供生产HTTPS地址');
const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
const stamp=Date.now(),username=`scope.teacher.${stamp}`,adminName=`scope.admin.${stamp}`;
const password=`Aa9!${randomBytes(18).toString('base64url')}`;
const tenantIds:string[]=[],userIds:string[]=[];
async function login(username:string,password:string){
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  assert.equal(response.status,200);return response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
}
async function call(path:string,cookie:string,init:RequestInit={},expected=200){
  const response=await fetch(base+path,{...init,headers:{Cookie:cookie,...init.headers as Record<string,string>}});
  const data=await response.json().catch(()=>({}));assert.equal(response.status,expected,`${path} -> ${response.status}: ${JSON.stringify(data)}`);return data;
}
const json=(value:unknown,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
try{
  const {data:tenant,error:te}=await schema.from('tenants').insert({code:`account.scope.smoke.${stamp}`,name:'账号权限隔离验收园所'}).select('id').single();if(te)throw te;tenantIds.push(tenant.id);
  const {data:admin,error:ae}=await authProvider.createUser({email:internalEmail(adminName),password,appMetadata:{application:'tongji_v3',purpose:'account_scope_acceptance'}});if(ae || !admin)throw new Error(ae?.message || '临时身份创建失败');userIds.push(admin.user.id);
  const {error:pe}=await schema.from('profiles').insert({user_id:admin.user.id,tenant_id:tenant.id,username:adminName,display_name:'虚构教研员验收',role:'researcher',status:'active',created_by:admin.user.id});if(pe)throw pe;
  const cookie=await login(adminName,password);
  const a=(await call('/api/classrooms',cookie,json({name:'验收甲班',grade:'middle',academicYear:'2026-2027',semester:'测试'}),201)).item.id;
  const b=(await call('/api/classrooms',cookie,json({name:'验收乙班',grade:'middle',academicYear:'2026-2027',semester:'测试'}),201)).item.id;
  const invalid=await call('/api/accounts',cookie,json({username,displayName:'虚构教师验收',role:'teacher',password:'lowercase123',classroomIds:[a]}),422);
  assert.ok(invalid.fields.password.some((message:string)=>message.includes('大写字母')));
  const teacher=(await call('/api/accounts',cookie,json({username,displayName:'虚构教师验收',role:'teacher',password,classroomIds:[a]}),201)).item;userIds.push(teacher.user_id);
  const teacherCookie=await login(username,password);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[a]);
  const update=await call(`/api/accounts/${teacher.user_id}/classrooms`,cookie,json({classroomIds:[b]},'PATCH'));
  assert.deepEqual(update.item.classroom_ids,[b]);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[b]);
  await call(`/api/accounts/${teacher.user_id}/classrooms`,teacherCookie,json({classroomIds:[a]},'PATCH'),403);
  await call(`/api/accounts/${admin.user.id}/classrooms`,cookie,json({classroomIds:[a]},'PATCH'),409);
  const {data:foreign,error:fe}=await schema.from('tenants').insert({code:`account.scope.foreign.${stamp}`,name:'虚构外园验收'}).select('id').single();if(fe)throw fe;tenantIds.push(foreign.id);
  const {data:foreignClass,error:fce}=await schema.from('classrooms').insert({tenant_id:foreign.id,name:'外园验收班',grade:'middle',academic_year:'2026-2027',semester:'测试',created_by:admin.user.id}).select('id').single();if(fce)throw fce;
  await call(`/api/accounts/${teacher.user_id}/classrooms`,cookie,json({classroomIds:[foreignClass.id]},'PATCH'),422);
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items.map((item:any)=>item.id),[b]);
  await call(`/api/accounts/${teacher.user_id}/classrooms`,cookie,json({classroomIds:[]},'PATCH'));
  assert.deepEqual((await call('/api/classrooms',teacherCookie)).items,[]);
  assert.equal((await call('/api/classrooms',cookie)).items.length,2);
  console.log('生产真实账号验收通过：字段错误、创建并分班、同会话范围变更、教师越权/跨园拦截、教研全园不变及清空范围。');
}finally{
  for(const tenantId of tenantIds){
    for(const table of ['classroom_teachers','classrooms','audit_events','profiles']){const {error}=await schema.from(table).delete().eq('tenant_id',tenantId);if(error)throw new Error(`验收${table}清理失败: ${error.message}`);}
    const {error}=await schema.from('tenants').delete().eq('id',tenantId);if(error)throw new Error(error.message);
  }
  for(const id of userIds.reverse()){const {error}=await authProvider.deleteUser(id);if(error)throw new Error(error.message);}
  console.log('隔离测试园所、班级和临时账号已清理，未创建截图中的账号。');
}
