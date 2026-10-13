import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { Document, Packer, Paragraph } from 'docx';
import { config, internalEmail } from '../src/config.js';
import { mediaStorage } from '../src/runtime/media-storage.js';
import { serviceClient } from '../src/supabase.js';

if (config.isLocalLite || !process.argv.includes('--authorized-production-fixtures')) {
  throw new Error('仅在已授权生产验收时传入 --authorized-production-fixtures');
}
const base = process.argv[2]?.replace(/\/$/,'');
if (!base?.startsWith('https://')) throw new Error('生产验收需使用公开HTTPS地址');
const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
const marker = `resource.smoke.${Date.now()}`;
let userId = ''; let tenantId = ''; let cookie = '';

async function call(path:string, init:RequestInit={}, expected=200) {
  const response = await fetch(base+path,{...init,headers:{Cookie:cookie,...init.headers as Record<string,string>}});
  const body = await response.text();
  assert.equal(response.status,expected,`${path} -> ${response.status}: ${body.slice(0,1000)}`);
  return body ? JSON.parse(body) : null;
}
const json = (value:unknown,method='POST') => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function upload(id:string,type:string,name:string,mime:string,body:Buffer | Readable,size:number) {
  const query = new URLSearchParams({assetType:type,fileName:name,mimeType:mime,sizeBytes:String(size)});
  return call(`/api/curriculum-resource-packages/${id}/assets?${query}`,{
    method:'POST',headers:{'Content-Type':'application/x-tongji-resource-stream'},body:body as unknown as BodyInit,
    ...(body instanceof Readable ? {duplex:'half'} : {}),
  } as RequestInit,201);
}

try {
  const {data:sourceModels,error:modelError} = await schema.from('ai_model_configs').select('model_key').limit(1);
  if(modelError) throw new Error(`当前模型读取失败: ${modelError.message}`);
  const {data:tenant,error:tenantError} = await schema.from('tenants').insert({code:marker,name:'资源库隔离验收园所'}).select('id').single();
  if(tenantError) throw new Error(`隔离验收园所创建失败: ${tenantError.message}`);
  tenantId = tenant.id;
  const password = `Aa9!${randomBytes(18).toString('base64url')}`;
  const {data:identity,error:identityError} = await serviceClient.auth.admin.createUser({
    email:internalEmail(marker),password,email_confirm:true,
    app_metadata:{application:'tongji_v3',purpose:'resource_library_acceptance'},
  });
  if(identityError || !identity.user) throw new Error(`临时验证身份创建失败: ${identityError?.message}`);
  userId = identity.user.id;
  const {error:profileError} = await schema.from('profiles').insert({user_id:userId,tenant_id:tenantId,username:marker,display_name:'隔离资源验收',role:'researcher',status:'active',created_by:userId});
  if(profileError) throw new Error(profileError.message);
  if(sourceModels?.[0]) {
    const {error} = await schema.from('ai_model_configs').insert({tenant_id:tenantId,model_key:sourceModels[0].model_key,created_by:userId,updated_by:userId});
    if(error) throw new Error(error.message);
  }
  const login = await fetch(base+'/api/auth/login',json({username:marker,password}));
  assert.equal(login.status,200);
  cookie = login.headers.getSetCookie().map((value) => value.split(';',1)[0]).join('; ');
  const prompts = await call('/api/ai-prompts');
  assert.ok(prompts.items.some((item:any) => item.key === 'resource_category_analysis'));
  const created = await call('/api/curriculum-resource-packages',json({title:marker,category:'life',activityOrigin:'幼儿发现瓶子可以装物品，讨论生活中的材料如何分类整理。',applicableGrades:['middle'],themes:['瓶子探究']}),201);
  const id = created.item.id;
  const document = await Packer.toBuffer(new Document({sections:[{children:[
    new Paragraph('课程活动来源：幼儿发现小瓶子可以装不同材料，提出整理生活物品的问题。'),
    new Paragraph('课程实施：幼儿比较瓶子容量，按材料类型分类，协商共同整理的方法。'),
    new Paragraph('教师观察重点：观察幼儿怎样描述分类依据，如何比较和协商，不以此判断幼儿能力高低。'),
  ]}]}));
  const plan = await upload(id,'plan','验收课程计划.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',document,document.length);
  const preview = await call(`/api/curriculum-resource-assets/${plan.item.id}/preview`);
  assert.equal(preview.kind,'text'); assert.match(preview.text,/分类/);
  async function* chunks() { const chunk=Buffer.alloc(1024*1024);for(let i=0;i<500;i++) yield chunk; }
  const large = await upload(id,'supplement','500MB流式边界.pdf','application/pdf',Readable.from(chunks()),500*1024*1024);
  console.log('公开HTTPS上传500MB成功。');
  const query = new URLSearchParams({assetType:'supplement',fileName:'超限.pdf',mimeType:'application/pdf',sizeBytes:String(500*1024*1024+1)});
  await call(`/api/curriculum-resource-packages/${id}/assets?${query}`,{method:'POST',headers:{'Content-Type':'application/x-tongji-resource-stream'},body:'x'},422);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  const material = await upload(id,'materials','验收材料.pdf','application/pdf',pdf,pdf.length);
  await upload(id,'booklet','验收手册.pdf','application/pdf',pdf,pdf.length);
  const pdfPreview = await call(`/api/curriculum-resource-assets/${material.item.id}/preview`);
  assert.equal(pdfPreview.kind,'pdf');
  const signed = await fetch(pdfPreview.url,{method:'HEAD'});
  assert.ok(signed.ok,'PDF签名预览链接不可用');
  assert.match(signed.headers.get('content-type') || '',/application\/pdf/);
  const largeStored = await schema.from('curriculum_resource_assets').select('size_bytes,storage_path').eq('id',large.item.id).single();
  assert.equal(Number(largeStored.data?.size_bytes),500*1024*1024);
  await call(`/api/curriculum-resource-packages/${id}/submit`,{method:'POST'});
  await call(`/api/curriculum-resource-packages/${id}/review`,json({decision:'active',comment:'隔离验收'},'PATCH'));
  await call(`/api/curriculum-resource-packages/${id}`,{method:'DELETE'},409);
  const before = await call('/api/resource-categories/life/analysis');
  assert.equal(before.item,null,'分类不应在浏览或上传时自动分析');
  const start = await call('/api/resource-categories/life/analyze',{method:'POST'},202);
  let analysis:any;
  for(let attempt=0;attempt<160;attempt++) {
    analysis = await call('/api/resource-categories/life/analysis');
    if(['completed','failed'].includes(analysis.item?.status)) break;
    await new Promise((resolve) => setTimeout(resolve,2000));
  }
  assert.equal(analysis.item?.id,start.item.id);
  assert.equal(analysis.item?.status,'completed',analysis.item?.error_message);
  assert.notEqual(analysis.item.provider,'ScenarioAIProvider','生产不得用模拟结果通过验收');
  assert.ok(analysis.item.result.directionalContent.length);
  assert.ok(analysis.item.result.indicatorFocus.length);
  console.log(`真实分类AI成功：${analysis.item.model}；两类输出及来源回链完整。`);
  const draft = await call('/api/curriculum-resource-packages',json({title:marker+'草稿',category:'life',activityOrigin:'清理演示草稿',applicableGrades:['middle'],themes:[]}),201);
  await upload(draft.item.id,'plan','草稿计划.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',document,document.length);
  await call(`/api/curriculum-resource-packages/${draft.item.id}`,{method:'DELETE'},204);
} finally {
  if(tenantId) {
    const {data:assets,error} = await schema.from('curriculum_resource_assets').select('storage_path').eq('tenant_id',tenantId);
    if(error) throw new Error(`验收目录清理失败: ${error.message}`);
    for(const asset of assets ?? []) {const {error:storageError} = await mediaStorage.remove(asset.storage_path);if(storageError) throw new Error(`验收文件清理失败: ${storageError.message}`);}
    for(const table of ['resource_category_analyses','professional_memories','curriculum_resource_packages','ai_model_configs','audit_events','profiles']) {
      const {error:cleanupError} = await schema.from(table).delete().eq('tenant_id',tenantId);
      if(cleanupError) throw new Error(`验收数据${table}清理失败: ${cleanupError.message}`);
    }
    const {error:tenantCleanupError} = await schema.from('tenants').delete().eq('id',tenantId);
    if(tenantCleanupError) throw new Error(tenantCleanupError.message);
  }
  if(userId) { const {error} = await serviceClient.auth.admin.deleteUser(userId);if(error) throw new Error(error.message); }
  console.log('隔离验收园所、临时身份、资料和500MB文件已清理。');
}
