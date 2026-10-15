import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const production = process.argv.includes('--production');
if (production && !process.argv.includes('--authorized-production-fixtures')) throw new Error('需要明确授权线上隔离验收');
const base = production ? 'https://tongji.meidaquan.com' : 'http://127.0.0.1:5300';
const {chromium} = createRequire(new URL('../apps/v3-local/package.json', import.meta.url))('playwright');
const backend = source => execFileSync(production ? 'ssh' : 'docker', production
  ? ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes', '-o', 'LogLevel=ERROR', 'root@122.51.180.226', 'docker exec -i tongji_v3-api-1 node --input-type=module']
  : ['exec', '-i', 'tongji_v3_local-api-1', 'node', '--input-type=module'], {input: source, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
const common = `
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {config,internalEmail} from './dist/src/config.js';
import {serviceClient,userClient} from './dist/src/supabase.js';
import {authProvider} from './dist/src/runtime/auth-provider.js';
const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
async function snapshot() {
  const fields={profiles:'user_id,tenant_id,display_name,role,status',classroom_teachers:'tenant_id,user_id,classroom_id',children:'id,tenant_id,status,guardian_consent_status',
    ai_model_configs:'tenant_id,model_key,revision',ai_prompt_configs:'id,tenant_id,revision',ai_credential_configs:'tenant_id,profile,revision',
    observations:'id,tenant_id,status,updated_at',period_reports:'id,tenant_id,status,updated_at'};
  const output={};
  for(const [table,columns] of Object.entries(fields)) {
    const rows=[];
    for(let offset=0;;offset+=500) {
      const {data,error}=await schema.from(table).select(columns).range(offset,offset+499);if(error)throw new Error('快照读取失败：'+table);
      rows.push(...data);if(data.length<500)break;
    }
    output[table]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex')};
  }
  return output;
}
async function cleanup(tenantIds,userIds) {
  for(const tenantId of tenantIds) {
    for(const table of ['audit_events','ai_credential_configs','profiles']) {
      const {error}=await schema.from(table).delete().eq('tenant_id',tenantId);if(error)throw new Error('清理失败：'+table);
    }
    const {error}=await schema.from('tenants').delete().eq('id',tenantId);if(error)throw new Error('测试园所清理失败');
  }
  for(const userId of userIds){const {error}=await authProvider.deleteUser(userId);if(error)throw new Error('测试身份清理失败');}
}
`;

let fixture, browser;
const errors = [];
try {
  fixture = JSON.parse(backend(common + `
    const before=await snapshot(),tenantIds=[],userIds=[],identities=[];
    try {
      for(let index=0;index<2;index++) {
        const code='credential.acceptance.'+Date.now()+'.'+index;
        const {data:tenant,error}=await schema.from('tenants').insert({code,name:'虚构密钥配置验收园'}).select('id').single();if(error)throw error;
        tenantIds.push(tenant.id);
        for(const role of index===0?['researcher','teacher']:['researcher']) {
          const username='cred.'+Date.now()+'.'+index+'.'+role,password='Aa9!'+randomBytes(24).toString('base64url');
          const {data,error}=await authProvider.createUser({email:internalEmail(username),password,appMetadata:{application:'tongji_v3',purpose:'ai_credential_acceptance'}});
          if(error||!data?.user)throw new Error('测试身份创建失败');userIds.push(data.user.id);
          const {error:pe}=await schema.from('profiles').insert({user_id:data.user.id,tenant_id:tenant.id,username,display_name:'虚构密钥验收账号',role,status:'active',created_by:data.user.id});if(pe)throw new Error('测试账号档案创建失败');
          identities.push({username,password,role});
        }
      }
      console.log(JSON.stringify({before,tenantIds,userIds,identities}));
    } catch(error) {await cleanup(tenantIds,userIds);throw error;}
  `));
  browser = await chromium.launch({channel: 'chrome'});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on('pageerror', error => errors.push(error.message));
  async function api(client, path, method = 'GET', value, expected = 200) {
    const response = await client.fetch(base + path, {method, ...(value === undefined ? {} : {data: value})});
    assert.equal(response.status(), expected, `${method} ${path}: ${response.status()}`);
    const text = await response.text();
    assert.ok(!text.includes('sk-'), 'HTTP response must not contain key material');
    return JSON.parse(text);
  }
  await api(page.request, '/api/ai-credential-config', 'GET', undefined, 401);
  const admin = fixture.identities[0];
  await page.goto(base);
  await page.getByLabel('账号', {exact: true}).fill(admin.username);
  await page.getByLabel('密码', {exact: true}).fill(admin.password);
  await page.getByRole('button', {name: '登录系统', exact: true}).click();
  await page.waitForFunction(() => sessionStorage.getItem('tongji.password-login.current-tab') === '1');
  const originalModel = (await api(page.request, '/api/ai-model-config')).item;
  assert.equal((await api(page.request, '/api/ai-credential-config')).item.profile, 'YT');
  await api(page.request, '/api/ai-credential-config', 'PUT', {profile: 'unknown', expectedRevision: 0}, 422);
  await api(page.request, '/api/ai-credential-config', 'PUT', {profile: 'YQY', expectedRevision: 0, apiKey: 'forbidden-field'}, 422);
  await page.goto(base + '/ai-prompts');
  await page.getByRole('combobox', {name: '千问 API 密钥', exact: true}).waitFor();
  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({width, height: 1000});
    const geometry = await page.locator('.prompt-credential-panel').evaluate(element => {
      const select = element.querySelector('select').getBoundingClientRect();
      const button = element.querySelector('button').getBoundingClientRect();
      return {selectWidth: select.width, buttonX: button.x, selectRight: select.right, buttonY: button.y, selectY: select.y};
    });
    assert.ok(geometry.selectWidth >= 230 && geometry.buttonX > geometry.selectRight);
    assert.ok(Math.abs(geometry.buttonY - geometry.selectY) < 35);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({width: 1440, height: 1000});
  await page.getByRole('combobox', {name: '千问 API 密钥', exact: true}).selectOption('YQY');
  await page.getByRole('button', {name: '保存密钥选择', exact: true}).click();
  await page.getByText('当前使用 YQY', {exact: true}).waitFor();
  assert.ok(!(await page.locator('body').innerText()).includes('sk-'));
  await page.screenshot({path: production ? '/tmp/tongji-credential-production.png' : '/tmp/tongji-credential-local.png', fullPage: true});
  await page.reload();
  assert.equal(await page.getByRole('combobox', {name: '千问 API 密钥', exact: true}).inputValue(), 'YQY');
  await api(page.request, '/api/ai-credential-config', 'PUT', {profile: 'YT', expectedRevision: 0}, 409);
  assert.deepEqual((await api(page.request, '/api/ai-model-config')).item, originalModel);

  for (const [index, expectedStatus] of [[1, 403], [2, 200]]) {
    const context = await browser.newContext();
    const identity = fixture.identities[index];
    await api(context.request, '/api/auth/login', 'POST', {username: identity.username, password: identity.password});
    const response = await api(context.request, '/api/ai-credential-config', 'GET', undefined, expectedStatus);
    if (index === 1) await api(context.request, '/api/ai-credential-config', 'PUT', {profile: 'YT', expectedRevision: 1}, 403);
    else assert.equal(response.item.profile, 'YT', 'another tenant must keep its own default');
    await context.close();
  }
  const probe = JSON.parse(backend(common + `
    import {resolveTenantPrompt} from './dist/src/ai/prompt-config.js';
    import {QianwenAIProvider} from './dist/src/ai/qianwen-provider.js';
    const tenantId=${JSON.stringify(fixture.tenantIds[0])};
    const prompt=await resolveTenantPrompt(tenantId,'curriculum_interest_clustering');
    assert.equal(prompt.credentialProfile,'YQY');assert.ok(!JSON.stringify(prompt).includes('sk-'));
    let calls=0;
    const provider=new QianwenAIProvider({apiKey:config.qwenApiKey,apiKeys:config.qwenApiKeys,baseUrl:config.QWEN_BASE_URL,textModel:config.QWEN_TEXT_MODEL,visionModel:config.QWEN_VISION_MODEL,timeoutMs:config.QWEN_TIMEOUT_MS},async(url,init)=>{
      assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+config.qwenApiKeys.YQY);
      assert.ok(!String(init.body).includes('sk-'));calls++;return fetch(url,init);
    });
    const started=Date.now();
    const result=await provider.clusterInterests({observations:[{id:'51515151-5151-4151-8151-515151515151',theme:'虚构桥梁材料技术验收',scene:'建构区',teacher_identification:'此输入为虚构接口验收材料，不含幼儿信息。',teacher_response:{strategy:'测试后续材料计划'}}],prompt});
    assert.equal(result.provider,'QianwenAIProvider');assert.ok(result.data.clusters.length>0);
    const {data:configs,error}=await schema.from('ai_credential_configs').select('*').eq('tenant_id',tenantId);if(error)throw error;
    assert.ok(!JSON.stringify(configs).includes('sk-'));
    const {data:audits,error:ae}=await schema.from('audit_events').select('detail').eq('tenant_id',tenantId).eq('action','ai_credential_config.updated');if(ae)throw ae;
    assert.ok(audits.length>0);assert.ok(!JSON.stringify(audits).includes('sk-'));
    console.log(JSON.stringify({profile:prompt.credentialProfile,provider:result.provider,model:result.model,calls,elapsedMs:Date.now()-started,clusters:result.data.clusters.length,keyStoredInDatabase:false}));
  `));
  await api(page.request, '/api/ai-credential-config', 'PUT', {profile: 'YT', expectedRevision: 1});
  assert.equal((await api(page.request, '/api/ai-credential-config')).item.profile, 'YT');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({event: 'credential_acceptance_passed', environment: production ? 'production' : 'local', desktopWidths: [1920, 1440, 1280], tenantIsolation: true, teacherForbidden: true, revisionConflict: true, refreshPersistence: true, modelUnchanged: true, realAI: probe, pageErrors: errors.length}));
} finally {
  if (browser) await browser.close();
  if (fixture) {
    const result = JSON.parse(backend(common + `
      const tenantIds=${JSON.stringify(fixture.tenantIds)},userIds=${JSON.stringify(fixture.userIds)};
      await cleanup(tenantIds,userIds);
      const after=await snapshot();assert.deepEqual(after,${JSON.stringify(fixture.before)});
      console.log(JSON.stringify({customerMetadataUnchanged:true,testTenantsRemoved:tenantIds.length,testIdentitiesRemoved:userIds.length}));
    `));
    console.log(JSON.stringify({event: 'cleanup_passed', ...result}));
  }
}
