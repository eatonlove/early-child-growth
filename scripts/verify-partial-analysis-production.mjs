import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

if (!process.argv.includes('--authorized-production-fixtures')) throw new Error('需要明确授权线上隔离验收');
const base = 'https://tongji.meidaquan.com';
const {chromium} = createRequire(new URL('../apps/v3-local/package.json', import.meta.url))('playwright');
const remote = source => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes', '-o', 'LogLevel=ERROR', 'root@122.51.180.226', 'docker exec -i tongji_v3-api-1 node --input-type=module'], {input: source, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshotSource = `
import {createHash} from 'node:crypto';
import {config,internalEmail} from './dist/src/config.js';
import {serviceClient} from './dist/src/supabase.js';
import {authProvider} from './dist/src/runtime/auth-provider.js';
const schema=serviceClient.schema(config.SUPABASE_SCHEMA);
async function snapshot(excludedTenant) {
  const fields={profiles:'user_id,tenant_id,display_name,role,status',classroom_teachers:'tenant_id,user_id,classroom_id',
    children:'id,tenant_id,classroom_id,status,guardian_consent_status',ai_model_configs:'tenant_id,model_key,revision',
    ai_prompt_configs:'id,tenant_id,revision',observations:'id,tenant_id,status,updated_at',
    period_reports:'id,tenant_id,status,updated_at',observation_imports:'id,tenant_id,status,observation_id,updated_at'};
  const output={};
  for(const [table,columns] of Object.entries(fields)) {
    const rows=[];
    for(let offset=0;;offset+=500) {
      let query=schema.from(table).select(columns).range(offset,offset+499);
      if(excludedTenant)query=query.neq('tenant_id',excludedTenant);
      const {data,error}=await query;if(error)throw new Error('快照读取失败: '+table);
      rows.push(...data);if(data.length<500)break;
    }
    output[table]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex')};
  }
  return output;
}
`;

let fixture, browser, page, activeJobId;
const browserErrors = [];
async function call(path, value, expected = 200, method = 'POST') {
  const response = await page.request.fetch(base + path, {method, ...(value === undefined ? {} : {data: value}), timeout: 60000});
  const data = await response.json();
  assert.equal(response.status(), expected, `${path}: ${data.code ?? response.status()}`);
  return data;
}
async function settle(jobId, timeout = 20 * 60 * 1000) {
  const deadline = Date.now() + timeout;
  let state = '';
  while (Date.now() < deadline) {
    const {item} = await call(`/api/analysis-jobs/${jobId}`, undefined, 200, 'GET');
    if (['completed', 'failed', 'cancelled'].includes(item.status)) return item;
    const next = `${item.stage}:${item.progress}`;
    if (state !== next) {
      console.log(JSON.stringify({event: 'ai_progress', stage: item.stage, progress: item.progress}));
      state = next;
    }
    await sleep(5000);
  }
  throw new Error('隔离任务尚未结束，不能提前清理: ' + jobId);
}

try {
  fixture = JSON.parse(remote(snapshotSource + `
    import {randomBytes} from 'node:crypto';
    import {execFileSync} from 'node:child_process';
    if(config.isLocalLite||config.AI_MODE!=='qianwen'||!config.qwenMediaAnalysisEnabled)throw new Error('必须使用线上真实AI与媒体服务');
    const before=await snapshot();
    const {data:models,error:me}=await schema.from('ai_model_configs').select('tenant_id,model_key,revision');if(me)throw me;
    if(new Set(models.map(row=>row.model_key)).size!==1)throw new Error('请先明确生产参照模型');
    const source=models[0];
    const {data:prompts,error:pe}=await schema.from('ai_prompt_configs').select('prompt_key,custom_prompt,base_prompt_version').eq('tenant_id',source.tenant_id).eq('prompt_key','observation_analysis');if(pe)throw pe;
    const username='partial.acceptance.'+Date.now(),password='Aa9!'+randomBytes(24).toString('base64url');
    const video=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',
      'color=c=white:s=320x240:r=2:d=4,drawbox=x=70:y=120:w=40:h=80:color=green:t=fill,drawbox=x=210:y=120:w=40:h=80:color=green:t=fill,drawbox=x=60:y=95:w=200:h=25:color=red:t=fill',
      '-c:v','libx264','-pix_fmt','yuv420p','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1']);
    const {data:tenant,error:te}=await schema.from('tenants').insert({code:username,name:'虚构部分分析验收园'}).select('id').single();if(te)throw te;
    let userId;
    try {
      const {data,error}=await authProvider.createUser({email:internalEmail(username),password,appMetadata:{application:'tongji_v3',purpose:'partial_analysis_production_acceptance'}});
      if(error||!data?.user)throw new Error('隔离身份创建失败');userId=data.user.id;
      const {error:profileError}=await schema.from('profiles').insert({user_id:userId,tenant_id:tenant.id,username,display_name:'虚构验收教研员',role:'researcher',status:'active',created_by:userId});if(profileError)throw profileError;
      for(const prompt of prompts) {
        const {error}=await schema.from('ai_prompt_configs').insert({...prompt,tenant_id:tenant.id,revision:1,created_by:userId,updated_by:userId,change_note:'隔离验收复制，不修改客户提示词'});if(error)throw error;
      }
      console.log(JSON.stringify({tenantId:tenant.id,userId,username,password,before,model:source.model_key,sourceModelRevision:source.revision,copiedCustomPrompt:prompts.length>0,video:video.toString('base64')}));
    } catch(error) {
      for(const table of ['ai_prompt_configs','profiles','tenants']) {
        const query=schema.from(table).delete();await (table==='tenants'?query.eq('id',tenant.id):query.eq('tenant_id',tenant.id));
      }
      if(userId)await authProvider.deleteUser(userId);throw error;
    }
  `));
  browser = await chromium.launch({channel: 'chrome'});
  page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 500) browserErrors.push(`API ${response.status()}`);
  });
  await page.goto(base);
  await page.getByLabel('账号', {exact: true}).fill(fixture.username);
  await page.getByLabel('密码', {exact: true}).fill(fixture.password);
  await page.getByRole('button', {name: '登录系统', exact: true}).click();
  await page.waitForFunction(() => sessionStorage.getItem('tongji.password-login.current-tab') === '1');
  await call('/api/ai-model-config', {model: fixture.model, expectedRevision: 0}, 200, 'PUT');
  const classroom = (await call('/api/classrooms', {name: '虚构中班验收', grade: 'middle', academicYear: '2026-2027', semester: '测试'}, 201)).item;
  const children = [];
  for (const [index, name] of ['虚构小桥', '虚构小木'].entries()) children.push((await call('/api/children', {classroomId: classroom.id, internalCode: `PARTIAL${index}`, displayName: name, birthMonth: '2022-01-01', guardianConsentStatus: 'granted'}, 201)).item);
  const teacherObservation = '以下文字全部为虚构技术验收情境：虚构小桥把两个桥墩向两侧推开，将长木板放在上面，木板落下。他把桥墩移近，再放上木板，木板留在桥墩上。没有记录虚构小木本次的动作或原话。所附视频仅为材料布局示意，没有真实儿童和音轨，颜色、形状与相对位置以画面为准。';
  assert.ok(!/红|绿/.test(teacherObservation));
  const observation = (await call('/api/observations', {
    classroomId: classroom.id, observerName: '虚构验收教师', occurredAt: '2026-10-15T09:00:00+08:00',
    scene: '建构区', theme: '虚构桥梁技术验收', organizationStage: 'process', observationFocusCategory: 'materials_tools',
    subjects: children.map((child, index) => ({childId: child.id, role: index === 0 ? 'primary' : 'participant', contextualFeature: '', evidenceAnchors: []})),
    teacherObservation, teacherIdentification: '先整理现有文字中的尝试，未记录到的个人行为不作推断。',
    teacherResponse: {category: 'material', strategy: '保留现有木板与桥墩，按需要支持继续尝试。', nextObservationFocus: '可补充每名幼儿的具体行动。'},
  }, 201)).item;
  const video = Buffer.from(fixture.video, 'base64');
  const ticket = await call(`/api/observations/${observation.id}/evidence-ticket`, {fileName: '虚构无真人材料布局.mp4', mimeType: 'video/mp4', sizeBytes: video.length}, 201);
  const upload = await page.request.post(base + ticket.uploadPath, {headers: {'Content-Type': 'application/x-tongji-evidence-stream'}, data: video});
  assert.equal(upload.status(), 200);
  assert.equal((await upload.json()).item.upload_status, 'ready');
  console.log(JSON.stringify({event: 'fixture_ready', model: fixture.model, sourceModelRevision: fixture.sourceModelRevision, copiedCustomPrompt: fixture.copiedCustomPrompt, syntheticVideoBytes: video.length}));
  await page.goto(base + '/observations');
  const submitted = page.waitForResponse(response => new URL(response.url()).pathname === `/api/observations/${observation.id}/analyze` && response.request().method() === 'POST');
  const started = Date.now();
  await page.getByRole('button', {name: '运行AI分析', exact: true}).click();
  const response = await submitted;
  assert.equal(response.status(), 202);
  activeJobId = (await response.json()).item.id;
  // Leaving the page must not cancel the persisted background job.
  await page.goto(base);
  const job = await settle(activeJobId);
  assert.equal(job.status, 'completed', `${job.error_code}: ${job.error_message}`);
  assert.equal(job.stage, 'completed', '资料有限也应生成分析，而非前置拦截');
  assert.equal(job.subject_results.length, 2);
  assert.ok(job.subject_results.every(result => result.status === 'completed' && result.analysisRunId));
  const detail = await call(`/api/observations/${observation.id}`, undefined, 200, 'GET');
  const own = detail.analyses.find(row => row.child_id === children[0].id);
  const context = detail.analyses.find(row => row.child_id === children[1].id);
  assert.equal(own.structured_result.analysisScope, 'individual');
  assert.ok(own.structured_result.facts.some(fact => fact.evidenceIds.includes('teacher-observation')));
  assert.equal(context.structured_result.analysisScope, 'context_only');
  assert.equal(context.structured_result.facts.length, 0);
  assert.equal(context.structured_result.developmentReferences.length, 0);
  assert.match(context.structured_result.objectiveSummary, /绿|green/i);
  assert.match(context.structured_result.objectiveSummary, /红|red/i);
  for (const row of [own, context]) {
    assert.equal(row.provider, 'QianwenAIProvider');
    assert.equal(row.model, fixture.model);
    assert.equal(row.input_snapshot.mediaAnalyzed, true);
    assert.equal(row.input_snapshot.diagnostics.evidencePolicy, 'available-material-first.v1');
    assert.equal(row.structured_result.responsePlans.length, 3);
    assert.ok(row.structured_result.evidenceGaps.length);
  }
  assert.equal(detail.item.teacher_observation, teacherObservation);
  console.log(JSON.stringify({event: 'real_ai_passed', elapsedMs: Date.now() - started, model: fixture.model,
    subjects: [own, context].map(row => ({scope: row.structured_result.analysisScope, facts: row.structured_result.facts.length, supportPlans: row.structured_result.responsePlans.length, mediaAnalyzed: row.input_snapshot.mediaAnalyzed, totalMs: row.input_snapshot.diagnostics.totalMs, groundingRetry: row.input_snapshot.diagnostics.groundingRetry})), visualCuesVerified: true}));
  await page.goto(base + '/observations');
  const cards = page.locator('.subject-result-card');
  await cards.nth(1).waitFor();
  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({width, height: 1000});
    const geometry = await cards.evaluateAll(elements => elements.map(element => {
      const card = element.getBoundingClientRect(), badge = element.querySelector('.badge').getBoundingClientRect(), text = element.querySelector('p').getBoundingClientRect();
      return {x: card.x, y: card.y, width: card.width, badgeHeight: badge.height, textWidth: text.width};
    }));
    assert.equal(geometry.length, 2);
    assert.ok(Math.abs(geometry[0].y - geometry[1].y) < 1);
    assert.ok(geometry[1].x - geometry[0].x - geometry[0].width >= 16);
    assert.ok(geometry.every(item => item.badgeHeight <= 32 && item.textWidth > 250));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({width: 1440, height: 1000});
  await page.locator('.observation-subject-results').screenshot({path: '/tmp/tongji-production-partial-analysis-desktop.png'});
  await page.locator('.evo-subject-chips button').filter({hasText: children[1].display_name}).click();
  await page.getByRole('heading', {name: '本次先提供情境分析与支持建议', exact: true}).waitFor();
  assert.equal(await page.getByRole('button', {name: '确认并采用', exact: true}).isEnabled(), true);
  await page.getByRole('button', {name: `补充${children[1].display_name}的观察`, exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('本次补充观察事实').waitFor();
  await dialog.getByRole('button', {name: '关闭', exact: true}).click();
  await call(`/api/analyses/${context.id}/decision`, {decision: 'adopted', note: '仅确认虚构情境支持参考'});
  await call(`/api/analyses/${own.id}/decision`, {decision: 'adopted', note: '仅确认虚构文字中的个体尝试'});
  assert.equal((await call(`/api/children/${children[1].id}/growth`, undefined, 200, 'GET')).timeline.length, 0);
  assert.equal((await call(`/api/children/${children[0].id}/growth`, undefined, 200, 'GET')).timeline.length, 1);
  await call('/api/reports/generate', {classroomId: classroom.id, childId: children[1].id, reportType: 'teacher', periodStart: '2026-10-01', periodEnd: '2026-10-15'}, 409);
  const exported = await call(`/api/observations/${observation.id}/document-exports`, {variant: 'professional'}, 201);
  const document = await page.request.get(base + `/api/document-exports/${exported.documentExport.id}/download`);
  assert.equal(document.status(), 200);
  assert.equal((await document.body()).subarray(0, 2).toString(), 'PK', '专业版应返回有效Word文件');
  assert.deepEqual(browserErrors, []);
  console.log(JSON.stringify({event: 'browser_acceptance_passed', desktopWidths: [1920, 1440, 1280], realEndpoints: true, backgroundSurvivedNavigation: true, optionalSupplementForm: true, teacherConfirmation: true, contextExcludedFromPersonalGrowth: true, professionalWordExport: true, pageErrors: 0, api5xx: 0}));
} finally {
  try {
    if (activeJobId && page) await settle(activeJobId);
    if (page && fixture) await call('/api/auth/logout');
  } catch (error) {
    console.error('会话收尾未完成，将通过服务端核对任务状态后清理：' + error.message);
  }
  await browser?.close();
  if (fixture) {
    const cleaned = JSON.parse(remote(snapshotSource + `
      import {mediaStorage} from './dist/src/runtime/media-storage.js';
      const fixture=${JSON.stringify(fixture ? {tenantId: fixture.tenantId, userId: fixture.userId, username: fixture.username} : {})};
      const {data:tenant,error}=await schema.from('tenants').select('code').eq('id',fixture.tenantId).single();
      if(error||tenant.code!==fixture.username||!tenant.code.startsWith('partial.acceptance.'))throw new Error('清理边界不匹配');
      const {count:active,error:activeError}=await schema.from('analysis_jobs').select('id',{count:'exact',head:true}).eq('tenant_id',fixture.tenantId).in('status',['queued','processing']);
      if(activeError||active)throw new Error('不得清理活动任务');
      for(const table of ['evidence_assets','document_exports','observation_imports']) {
        const {data,error}=await schema.from(table).select('storage_path').eq('tenant_id',fixture.tenantId);if(error)throw error;
        for(const row of data)if(row.storage_path){const {error}=await mediaStorage.remove(row.storage_path);if(error)throw error;}
      }
      for(const table of ['professional_memories','support_actions','response_plans','analysis_claim_reviews','analysis_runs','analysis_jobs','document_exports','evidence_assets','observation_subjects','observation_imports','observations','ai_model_configs','ai_prompt_configs','children','classroom_teachers','classrooms','audit_events','profiles']) {
        const {error}=await schema.from(table).delete().eq('tenant_id',fixture.tenantId);if(error)throw error;
      }
      const {error:te}=await schema.from('tenants').delete().eq('id',fixture.tenantId);if(te)throw te;
      const {error:ue}=await authProvider.deleteUser(fixture.userId);if(ue)throw ue;
      const {count:remaining,error:re}=await schema.from('tenants').select('id',{count:'exact',head:true}).eq('id',fixture.tenantId);if(re||remaining)throw new Error('隔离园所未清理');
      console.log(JSON.stringify({fixtureRemoved:true,identityRemoved:true,after:await snapshot()}));
    `));
    const changedTables = Object.keys(fixture.before).filter(table => fixture.before[table].hash !== cleaned.after[table].hash);
    console.log(JSON.stringify({event: 'cleanup_complete', fixtureRemoved: cleaned.fixtureRemoved, identityRemoved: cleaned.identityRemoved, customerMetadataUnchanged: changedTables.length === 0, changedTables}));
    assert.deepEqual(changedTables, [], '客户元数据有变化，请排查同期操作；不得自动回滚客户数据');
  }
}
