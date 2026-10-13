import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {promisify} from 'node:util';
import {Document,Packer,Paragraph} from 'docx';
import {Pool} from 'pg';
import {config} from '../src/config.js';
import {mediaStorage} from '../src/runtime/media-storage.js';

if(!config.isLocalLite||config.AI_MODE!=='simulated')throw new Error('该验收只允许本地数据库和模拟AI环境');
const base=(process.argv[2]||'http://web:8080').replace(/\/$/,'');
const pool=new Pool({connectionString:config.LOCAL_DATABASE_URL});
const ids:string[]=[],observations:string[]=[],imports:string[]=[],children:string[]=[],classes:string[]=[];
const directory=await mkdtemp(join(tmpdir(),'tongji-import-smoke-'));
let cookie='';
async function call(path:string,init:RequestInit={},expected=200){
  const response=await fetch(base+path,{...init,headers:{Cookie:cookie,...init.headers as Record<string,string>}});
  const data=await response.json();assert.equal(response.status,expected,`${path} -> ${response.status}: ${JSON.stringify(data)}`);return data;
}
const json=(value:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
try{
  const login=await fetch(base+'/api/auth/login',json({username:'research.admin',password:'LocalResearch123!'}));
  assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(item=>item.split(';',1)[0]).join('; ');
  const classroom=(await call('/api/classrooms',json({name:`导入验收-${Date.now()}`,grade:'middle',academicYear:'2026-2027',semester:'本地验收'}),201)).item;classes.push(classroom.id);ids.push(classroom.id);
  const child=(await call('/api/children',json({classroomId:classroom.id,internalCode:'SMOKE01',displayName:'虚构小桥',birthMonth:'2022-01-01',guardianConsentStatus:'pending'}),201)).item;children.push(child.id);ids.push(child.id);
  const paragraphs=['观察教师：虚构测试教师','幼儿姓名：虚构小桥','观察时间：2026.10.14 09:00','游戏场地：建构区','游戏主题：桥梁实验','观察聚焦：交往与规则','观察：虚构小桥把积木放在桥墩上，桥面倒下后与同伴讨论，再调整桥墩的位置。','识别：出现比较支撑位置与协商分工的经验线索。','应答：提供不同形状的支撑材料。','下一次观察重点：观察幼儿如何解释选择支撑物的理由。'];
  const document=await Packer.toBuffer(new Document({sections:[{children:paragraphs.map(text=>new Paragraph(text))}]}));
  const task=(await call('/api/observation-imports',json({classroomId:classroom.id,fileName:'虚构观察表.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',sizeBytes:document.length}),201)).item;imports.push(task.id);ids.push(task.id);
  const parsed=(await call(`/api/observation-imports/${task.id}/upload`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:document as unknown as BodyInit})).item;
  assert.equal(parsed.status,'needs_review');assert.equal(parsed.extracted_fields.observationFocusCategory,'social_experience');assert.deepEqual(parsed.matched_child_ids,[child.id]);
  const observation=(await call('/api/observations',json({classroomId:classroom.id,sourceImportId:task.id,observerName:'虚构测试教师',subjects:[{childId:child.id,role:'primary',contextualFeature:'蓝色衣服',evidenceAnchors:[]}],occurredAt:'2026-10-14T09:00:00+08:00',durationMinutes:20,scene:'建构区',theme:'桥梁实验',organizationStage:'process',observationFocusCategory:'social_experience',observationFocus:['协商与规则'],teacherObservation:parsed.extracted_fields.objectiveObservation,teacherIdentification:parsed.extracted_fields.teacherIdentification,teacherResponse:{category:'material',strategy:'提供不同形状支撑材料。',nextObservationFocus:'观察如何说明选择理由。'}}),201)).item;observations.push(observation.id);ids.push(observation.id);
  const confirmed=(await call(`/api/observation-imports/${task.id}`)).item;assert.equal(confirmed.observation_id,observation.id);assert.equal(confirmed.status,'confirmed');
  const file=join(directory,'virtual-video.mp4');
  await promisify(execFile)('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:r=2:d=1','-c:v','libx264','-timecode','00:00:00:00','-f','mov',file]);
  const video=await readFile(file);
  const ticket=await call(`/api/observations/${observation.id}/evidence-ticket`,json({fileName:'虚构手机视频.mp4',mimeType:'video/mp4',sizeBytes:video.length}),201);ids.push(ticket.evidenceId);
  const uploaded=(await call(ticket.uploadPath,{method:'POST',headers:{'Content-Type':'application/x-tongji-evidence-stream'},body:Readable.from([video]) as unknown as BodyInit,duplex:'half'} as RequestInit)).item;
  assert.equal(uploaded.upload_status,'ready');assert.ok(uploaded.optimized_size_bytes<=video.length);
  assert.equal(uploaded.optimization_status,'not_applicable');
  const storedVideo=await mediaStorage.download(uploaded.storage_path);
  assert.ok(storedVideo.data?.equals(video),'附加轨道不兼容时必须完整保留原文件');
  const invalid=await call(`/api/observations/${observation.id}/evidence-ticket`,json({fileName:'损坏视频.mp4',mimeType:'video/mp4',sizeBytes:5}),201);ids.push(invalid.evidenceId);
  await call(invalid.uploadPath,{method:'POST',headers:{'Content-Type':'application/x-tongji-evidence-stream'},body:'xxxxx'},422);
  const badSize=await call(`/api/observations/${observation.id}/evidence-ticket`,json({fileName:'不完整.pdf',mimeType:'application/pdf',sizeBytes:5}),201);ids.push(badSize.evidenceId);
  await call(badSize.uploadPath,{method:'POST',headers:{'Content-Type':'application/x-tongji-evidence-stream'},body:'xxxx'},422);
  const started=(await call(`/api/observations/${observation.id}/analyze`,{method:'POST'},202)).item;ids.push(started.id);
  let job=started;
  for(let i=0;i<100;i++){job=(await call(`/api/analysis-jobs/${started.id}`)).item;if(['completed','failed'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(job.status,'completed',job.error_message);
  const detail=await call(`/api/observations/${observation.id}`);
  assert.equal(detail.analyses.length,1);assert.equal(detail.analyses[0].input_snapshot.mediaAnalyzed,false);
  assert.match(detail.analyses[0].input_snapshot.mediaExclusionReason,/监护授权/);
  console.log('本地真实接口验收通过：Word解析与回填、教师确认关联、流式手机视频上传、损坏/不完整文件拒绝、后台任务返回202并完成、未授权媒体不发送。AI使用明确的本地模拟模式。');
}finally{
  const stored=await pool.query('select storage_path from tongji_v3.evidence_assets where observation_id=any($1::uuid[])',[observations]);
  const documents=await pool.query('select storage_path from tongji_v3.observation_imports where id=any($1::uuid[])',[imports]);
  for(const asset of [...stored.rows,...documents.rows])await mediaStorage.remove(asset.storage_path);
  await pool.query('update tongji_v3.observation_imports set observation_id=null where id=any($1::uuid[])',[imports]);
  await pool.query('update tongji_v3.observations set source_import_id=null where id=any($1::uuid[])',[observations]);
  for(const table of ['response_plans','analysis_claim_reviews','analysis_runs','analysis_jobs','evidence_assets','observation_subjects'])await pool.query(`delete from tongji_v3.${table} where observation_id=any($1::uuid[])`,[observations]);
  await pool.query('delete from tongji_v3.observations where id=any($1::uuid[])',[observations]);
  await pool.query('delete from tongji_v3.observation_imports where id=any($1::uuid[])',[imports]);
  await pool.query('delete from tongji_v3.children where id=any($1::uuid[])',[children]);
  await pool.query('delete from tongji_v3.classrooms where id=any($1::uuid[])',[classes]);
  await pool.query("delete from tongji_v3.audit_events where resource_id=any($1::text[]) or detail->>'observationId'=any($2::text[])",[ids,observations]);
  await pool.end();await rm(directory,{recursive:true,force:true});
  console.log('本地虚构观察、文档、视频和验收班级已清理。');
}
