import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Pool } from 'pg';
import { Document,Packer,Paragraph } from 'docx';
import { config } from '../src/config.js';

if(!config.isLocalLite) throw new Error('资源写操作验收仅允许本地验证环境');
const base=(process.argv[2] || 'http://web:8080').replace(/\/$/,'');
const pool=new Pool({connectionString:config.LOCAL_DATABASE_URL});
const ids:string[]=[];
let cookie='';
async function call(path:string,init:RequestInit={},expected=200) {
  const response=await fetch(base+path,{...init,headers:{Cookie:cookie,...(init.headers as Record<string,string> || {})}});
  const text=await response.text();
  assert.equal(response.status,expected,`${path} -> ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const json=(value:unknown) => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const document=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('懂生活课程来源：幼儿发现小瓶子能装不同物品。'),new Paragraph('课程活动：分类材料，比较容器容量，讨论如何整理生活物品。')]}]}));
const smallPdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
async function upload(id:string,type:string,name:string,mimeType:string,body:BodyInit | Readable | Buffer,size:number) {
  const query=new URLSearchParams({assetType:type,fileName:name,mimeType,sizeBytes:String(size)});
  return call(`/api/curriculum-resource-packages/${id}/assets?${query}`,{method:'POST',headers:{'Content-Type':'application/x-tongji-resource-stream'},body:body as BodyInit,...(body instanceof Readable ? {duplex:'half'} : {})} as RequestInit,201);
}
try {
  const login=await fetch(base+'/api/auth/login',json({username:'research.admin',password:'LocalResearch123!'}));
  assert.equal(login.status,200);
  cookie=login.headers.getSetCookie().map((value) => value.split(';',1)[0]).join('; ');
  const created=await call('/api/curriculum-resource-packages',json({title:`本地资源验收-${Date.now()}`,activityOrigin:'幼儿发现小瓶子可以装不同物品，提出如何分类整理的问题。',category:'life',applicableGrades:['middle'],themes:['瓶子探究']}),201);
  const id=created.item.id;ids.push(id);
  assert.equal(created.item.category,'life');
  const plan=await upload(id,'plan','课程计划.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',document,document.length);
  const preview=await call(`/api/curriculum-resource-assets/${plan.item.id}/preview`);
  assert.equal(preview.kind,'text');assert.match(preview.text,/分类材料/);
  const largeBytes=500*1024*1024;
  async function* chunks(){const chunk=Buffer.alloc(1024*1024);for(let i=0;i<500;i++) yield chunk;}
  await upload(id,'supplement','500MB边界资料.pdf','application/pdf',Readable.from(chunks()),largeBytes);
  const tooLargeQuery=new URLSearchParams({assetType:'supplement',fileName:'超限.pdf',mimeType:'application/pdf',sizeBytes:String(largeBytes+1)});
  await call(`/api/curriculum-resource-packages/${id}/assets?${tooLargeQuery}`,{method:'POST',headers:{'Content-Type':'application/x-tongji-resource-stream'},body:'x'},422);
  await upload(id,'materials','课程材料.pdf','application/pdf',smallPdf,smallPdf.length);
  await upload(id,'booklet','课程手册.pdf','application/pdf',smallPdf,smallPdf.length);
  await call(`/api/curriculum-resource-packages/${id}/submit`,{method:'POST'});
  await call(`/api/curriculum-resource-packages/${id}/review`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'active',comment:'本地验收'})});
  const started=await call('/api/resource-categories/life/analyze',{method:'POST'},202);
  let result:any;
  for(let attempt=0;attempt<80;attempt++) {result=await call('/api/resource-categories/life/analysis');if(['completed','failed'].includes(result.item?.status)) break;await new Promise((resolve) => setTimeout(resolve,250));}
  assert.equal(result.item.status,'completed',result.item.error_message);assert.equal(result.item.id,started.item.id);
  assert.ok(result.item.result.directionalContent.length);assert.ok(result.item.result.indicatorFocus.length);
  await call(`/api/curriculum-resource-packages/${id}`,{method:'DELETE'},409);
  const draft=await call('/api/curriculum-resource-packages',json({title:'本地删除验收',activityOrigin:'整理课程资料',category:'creation',applicableGrades:['small'],themes:[]}),201);
  ids.push(draft.item.id);
  await upload(draft.item.id,'plan','计划.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',document,document.length);
  await call(`/api/curriculum-resource-packages/${draft.item.id}`,{method:'DELETE'},204);
} finally {
  const assets=await pool.query('select storage_path from tongji_v3.curriculum_resource_assets where package_id = any($1::uuid[])',[ids]);
  const {mediaStorage}=await import('../src/runtime/media-storage.js');
  for(const asset of assets.rows) await mediaStorage.remove(asset.storage_path);
  await pool.query('delete from tongji_v3.resource_category_analyses where source_package_ids && $1::uuid[]',[ids]);
  await pool.query("delete from tongji_v3.professional_memories where source_resource_type='curriculum_resource_package' and source_resource_id=any($1::text[])",[ids]);
  await pool.query('delete from tongji_v3.curriculum_resource_packages where id=any($1::uuid[])',[ids]);
  await pool.end();
}
console.log('资源库真实接口验收通过：500MB成功、超限拒绝、Word预览、完整提交、手动分类分析、已入库删除保护、草稿文件清理；临时数据已清理。');
