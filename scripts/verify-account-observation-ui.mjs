import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

if(!process.argv.includes('--authorized-production-fixtures')) throw new Error('真实线上UI写入验收需要授权');
const {chromium}=createRequire(new URL('../apps/v3-local/package.json',import.meta.url))('playwright');
const remote=(source)=>execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','-o','LogLevel=ERROR','root@122.51.180.226','docker exec -i tongji_v3-api-1 node --input-type=module'],{input:source,encoding:'utf8',maxBuffer:1024*1024});
const setup=`
import {randomBytes} from 'node:crypto';
import {config,internalEmail} from './dist/src/config.js';
import {authProvider} from './dist/src/runtime/auth-provider.js';
import {serviceClient} from './dist/src/supabase.js';
const schema=serviceClient.schema(config.SUPABASE_SCHEMA),username='ui.acceptance.'+Date.now();
const password='Aa9!'+randomBytes(24).toString('base64url');
const {data:tenant,error:te}=await schema.from('tenants').insert({code:username,name:'虚构界面验收园'}).select('id').single();if(te)throw te;
let userId;
try {
  const {data,error}=await authProvider.createUser({email:internalEmail(username),password,appMetadata:{application:'tongji_v3',purpose:'account_observation_ui_acceptance'}});
  if(error||!data?.user)throw new Error('临时身份创建失败');userId=data.user.id;
  const {error:pe}=await schema.from('profiles').insert({user_id:userId,tenant_id:tenant.id,username,display_name:'虚构界面验收员',role:'researcher',status:'active',created_by:userId});if(pe)throw pe;
  console.log(JSON.stringify({tenantId:tenant.id,userId,username,password}));
}catch(error){await schema.from('profiles').delete().eq('tenant_id',tenant.id);await schema.from('tenants').delete().eq('id',tenant.id);if(userId)await authProvider.deleteUser(userId);throw error;}
`;
let fixture,browser;
const errors=[];
try {
  fixture=JSON.parse(remote(setup));
  browser=await chromium.launch({channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/api/')&&response.status()>=500)errors.push(`${new URL(response.url()).pathname}: ${response.status()}`);});
  await page.goto('https://tongji.meidaquan.com');
  await page.getByLabel('账号',{exact:true}).fill(fixture.username);
  await page.getByLabel('密码',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'登录系统',exact:true}).click();
  await page.waitForFunction(()=>sessionStorage.getItem('tongji.password-login.current-tab')==='1');
  await page.goto('https://tongji.meidaquan.com/accounts');
  await page.getByRole('button',{name:'修改名称',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('显示姓名').fill('虚构界面新教研员');
  await dialog.getByRole('button',{name:'保存显示名称',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.locator('.remote-user strong').filter({hasText:'虚构界面新教研员'}).waitFor();
  await page.locator('.remote-account-table').getByText('全园',{exact:true}).waitFor();
  await page.getByRole('button',{name:'新增账号',exact:true}).click();
  dialog=page.getByRole('dialog');
  const passwordInput=dialog.getByLabel('初始密码',{exact:true});
  await passwordInput.fill('VisualTest123!');
  assert.equal(await passwordInput.getAttribute('type'),'password');
  await dialog.getByRole('button',{name:'显示初始密码',exact:true}).click();
  assert.equal(await passwordInput.getAttribute('type'),'text');
  await dialog.getByRole('button',{name:'隐藏初始密码',exact:true}).click();
  assert.equal(await passwordInput.getAttribute('type'),'password');
  await page.screenshot({path:'/tmp/tongji-production-account-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/tongji-production-account-phone.png'});
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  const create=async(path,value)=>page.evaluate(async({path,value})=>{
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    if(!response.ok)throw new Error(`虚构资料创建失败: ${response.status}`);return response.json();
  },{path,value});
  const classroom=(await create('/api/classrooms',{name:'虚构界面验收班',grade:'middle',academicYear:'2026-2027',semester:'测试'})).item;
  await create('/api/children',{classroomId:classroom.id,internalCode:'UI01',displayName:'虚构界面幼儿',birthMonth:'2022-01-01',guardianConsentStatus:'pending'});
  await page.goto('https://tongji.meidaquan.com/observations');
  await page.getByRole('button',{name:'新建观察',exact:true}).click();
  await page.getByRole('button',{name:'网页直接填写'}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('游戏主题',{exact:true}).fill('虚构界面删除验收');
  await dialog.getByLabel(/^客观白描/).fill('虚构幼儿移动积木后再次尝试让桥面保持平衡。');
  await dialog.getByLabel(/^教师识别/).fill('观察到比较支撑位置的经验线索。');
  await dialog.getByLabel(/^教师原始应答/).fill('保留不同形状的支撑积木。');
  await dialog.getByLabel(/^下一次观察重点/).fill('继续观察是否主动比较支撑位置。');
  await dialog.locator('.evo-child-select').getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'保存教师观察',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'删除观察',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'删除观察记录'});
  await dialog.getByRole('button',{name:'确认删除观察',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByText('还没有观察记录',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('还没有观察记录',{exact:true}).waitFor();
  await page.goto('https://tongji.meidaquan.com/growth');
  await page.locator('.growth-interest-grid').waitFor();
  assert.ok(await page.locator('.growth-page').evaluate(element=>parseFloat(getComputedStyle(element).rowGap)>=20));
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.growth-page').evaluate(element=>parseFloat(getComputedStyle(element).rowGap)>=16));
  assert.deepEqual(errors,[]);
  console.log('线上真实Chrome验收通过：名称与当前会话即时更新、教研全园不变、密码显隐、标准观察创建/删除及刷新持久化、手机和桌面间距；无页面异常或API500。');
} finally {
  await browser?.close();
  if(fixture) remote(`
    import {config} from './dist/src/config.js';import {serviceClient} from './dist/src/supabase.js';
    import {authProvider} from './dist/src/runtime/auth-provider.js';import {mediaStorage} from './dist/src/runtime/media-storage.js';
    const fixture=${JSON.stringify({tenantId:fixture.tenantId,userId:fixture.userId,username:fixture.username})};
    const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
    const {data:tenant,error}=await schema.from('tenants').select('code').eq('id',fixture.tenantId).single();
    if(error||tenant.code!==fixture.username||!tenant.code.startsWith('ui.acceptance.'))throw new Error('清理边界不匹配');
    for(const table of ['evidence_assets','document_exports','observation_imports']){
      const {data,error}=await schema.from(table).select('storage_path').eq('tenant_id',fixture.tenantId);if(error)throw error;
      for(const item of data)if(item.storage_path){const {error}=await mediaStorage.remove(item.storage_path);if(error)throw error;}
    }
    for(const table of ['professional_memories','support_actions','response_plans','analysis_claim_reviews','analysis_jobs','analysis_runs','document_exports','evidence_assets','observation_subjects','observation_imports','observations','children','classroom_teachers','classrooms','audit_events','profiles']){
      const {error}=await schema.from(table).delete().eq('tenant_id',fixture.tenantId);if(error)throw error;
    }
    const {error:te}=await schema.from('tenants').delete().eq('id',fixture.tenantId);if(te)throw te;
    const {error:ue}=await authProvider.deleteUser(fixture.userId);if(ue)throw ue;
  `);
  if(fixture) console.log('线上虚构UI验收账号、园所、班级、幼儿、观察和文件均已清理。');
}
