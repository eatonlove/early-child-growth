// Read-only real-provider verification. Run with the candidate API build mounted at /verification.
// Never writes business rows, logs teacher text, or prints credentials.
import assert from 'node:assert/strict';
if(!process.argv.includes('--allow-production-readonly'))throw Error('Explicit production read-only verification flag required');
const observationId=process.argv.find(x=>x.startsWith('--observation-id='))?.split('=')[1];
if(!/^[0-9a-f-]{36}$/.test(observationId??''))throw Error('Observation ID required');
const {config}=await import('/verification/dist/src/config.js');
const {serviceClient}=await import('/verification/dist/src/supabase.js');
const {QianwenAIProvider}=await import('/verification/dist/src/ai/qianwen-provider.js');
const {resolveTenantPrompt}=await import('/verification/dist/src/ai/prompt-config.js');
const {analysisResultSchema}=await import('/verification/dist/src/ai/contracts.js');
const {repairAnalysisOutput}=await import('/verification/dist/src/ai/analysis-output-repair.js');
const {anonymizeSubjectNames,uniqueSubjectCues}=await import('/verification/dist/src/ai/subject-evidence.js');
const {mediaStorage}=await import('/verification/dist/src/runtime/media-storage.js');
const db=serviceClient.schema(config.SUPABASE_SCHEMA);
async function data(query){const r=await query;if(r.error)throw Error(r.error.message);return r.data;}
const observation=await data(db.from('observations').select('*').eq('id',observationId).single());
const tenant=observation.tenant_id;
const [subjects,classroom,evidence,memories,frameworks,prompt]=await Promise.all([
 data(db.from('observation_subjects').select('*').eq('tenant_id',tenant).eq('observation_id',observation.id).order('role')),
 data(db.from('classrooms').select('id,grade').eq('tenant_id',tenant).eq('id',observation.classroom_id).single()),
 data(db.from('evidence_assets').select('id,evidence_type,transcript,event_segments,upload_status,storage_path,mime_type').eq('tenant_id',tenant).eq('observation_id',observation.id).eq('upload_status','ready')),
 data(db.from('professional_memories').select('id,memory_type,summary,retrieval_text,applicability,quality_score').eq('tenant_id',tenant).eq('status','active').order('quality_score',{ascending:false}).limit(24)),
 data(db.from('analysis_framework_versions').select('id,framework_type,name,version,description,dimensions').eq('tenant_id',tenant).eq('status','active').eq('is_default',true).order('framework_type')),
 resolveTenantPrompt(tenant,'observation_analysis')]);
const children=await data(db.from('children').select('id,display_name,birth_month,guardian_consent_status').eq('tenant_id',tenant).in('id',subjects.map(s=>s.child_id)));
for(const [subjectIndex,subject] of subjects.entries()) {
const child=children.find(c=>c.id===subject.child_id);
const prior=await data(db.from('analysis_runs').select('id').eq('tenant_id',tenant).eq('child_id',child.id).eq('decision','adopted').limit(1));
if(prior.length)throw Error('Diagnostic requires reconstructing adopted history; stop before model call');
const knowledge=await data(db.from('knowledge_cards').select('*').or(`tenant_id.eq.${tenant},tenant_id.is.null`).eq('grade',classroom.grade).eq('status','active').limit(200));
const media=[];
if(config.qwenMediaAnalysisEnabled&&child.guardian_consent_status==='granted')for(const e of evidence.filter(e=>['photo','video'].includes(e.evidence_type)&&e.storage_path).slice(0,config.QWEN_MAX_MEDIA)){
 const {data:signed,error}=await mediaStorage.createSignedUrl(e.storage_path,900);
 if(error||!signed?.signedUrl)throw Error('Diagnostic signed media unavailable');
 media.push({id:e.id,evidenceType:e.evidence_type,mimeType:e.mime_type,signedUrl:signed.signedUrl});
}
const score=m=>(m.applicability?.childId===child.id?3:0)+(m.applicability?.classroomId===observation.classroom_id?2:0)+(Array.isArray(m.applicability?.themes)&&m.applicability.themes.some(t=>observation.theme.includes(t)||t.includes(observation.theme))?2:0)+(Array.isArray(m.applicability?.grades)&&m.applicability.grades.includes(classroom.grade)?1:0)+Number(m.quality_score);
const rankedMemories=memories.slice().sort((a,b)=>score(b)-score(a)).slice(0,8).map(m=>({id:m.id,memoryType:m.memory_type,summary:m.summary,retrievalText:m.retrieval_text,applicability:m.applicability??{},qualityScore:Number(m.quality_score)}));
let calls=0;
const began=Date.now();
const diagnosticFetch=async(url,init)=>{
 const body=typeof init?.body==='string'?JSON.parse(init.body):null;
 const isAnalysis=body?.response_format?.json_schema?.name==='tongji_observation_analysis';
 if(isAnalysis&&++calls>2)throw Error('Unexpected extra full generation');
 if(body?.response_format?.json_schema?.name==='tongji_observation_support_correction')console.log(JSON.stringify({event:'targeted_correction_requested',subjectIndex,fields:body.response_format.json_schema.schema.required.length}));
 let response=await fetch(url,init);
 if(isAnalysis){
  const p=await response.clone().json();let draft;const content=p.choices?.[0]?.message?.content;
  try{draft=JSON.parse(content);if(typeof draft==='string')draft=JSON.parse(draft);if(Array.isArray(draft)&&draft.length===1)draft=draft[0];}catch{}
  const fields=[];
  for(const [i,plan] of (draft?.responsePlans??[]).entries())for(const [group,key] of [['activitySupport','activityName'],['activitySupport','timing'],['activitySupport','objective'],['activitySupport','teacherRole'],['materialSupport','placement'],['materialSupport','purpose'],['experienceSupport','participationMode'],['experienceSupport','withdrawalCondition']]){
   const v=plan?.[group]?.[key];fields.push({path:`responsePlans.${i}.${group}.${key}`,type:typeof v,length:typeof v==='string'?v.trim().length:null,...(typeof v==='string'&&v.length<=4?{shortValue:v}:{})});
  }
  if(subjectIndex===0&&calls===1&&draft?.responsePlans?.[0]?.activitySupport){
   draft.responsePlans[0].activitySupport.activityName='继';
   p.choices[0].message.content=JSON.stringify(draft);
   response=new Response(JSON.stringify(p),{status:response.status,headers:response.headers});
   console.log(JSON.stringify({event:'injected_short_future_field_for_correction_verification',subjectIndex}));
  }
  const parsed=analysisResultSchema.safeParse(repairAnalysisOutput(structuredClone(draft)).value);
  console.log(JSON.stringify({diagnostic:'single analysis generation, no business writes',status:response.status,model:p.model,requestId:p.id,elapsedMs:Date.now()-began,finishReason:p.choices?.[0]?.finish_reason,usage:p.usage,contentChars:typeof content==='string'?content.length:null,analysisScope:draft?.analysisScope,fields,issues:parsed.success?[]:parsed.error.issues.slice(0,12).map(i=>({path:i.path.join('.'),code:i.code,minimum:i.minimum})),mediaCount:media.length,knowledgeCount:knowledge.length,schoolMemoryCount:rankedMemories.length,frameworkCount:frameworks.length}));
 }
 return response;
};
const provider=new QianwenAIProvider({apiKey:config.qwenApiKeys.YT,apiKeys:config.qwenApiKeys,baseUrl:config.QWEN_BASE_URL,textModel:config.QWEN_TEXT_MODEL,visionModel:config.QWEN_VISION_MODEL,timeoutMs:config.QWEN_TIMEOUT_MS,observationTimeoutMs:config.QWEN_OBSERVATION_TIMEOUT_MS,visionTimeoutMs:config.QWEN_VISION_TIMEOUT_MS,webSearchEnabled:config.qwenWebSearchEnabled},diagnosticFetch);
try{const generated=await provider.analyzeObservation({observation:{...observation,teacher_observation:anonymizeSubjectNames(observation.teacher_observation,children,child.id),subject_count:subjects.length,subject_identification_cues:uniqueSubjectCues(subject.contextual_feature||'',subjects.filter(s=>s.child_id!==child.id).map(s=>s.contextual_feature||'')),subject_additional_observation:anonymizeSubjectNames(subject.additional_observation||'',children,child.id),subject_context:subject.contextual_feature||'未补充本次个体情境特征',subject_role:subject.role,subject_evidence_anchors:subject.evidence_anchors??[]},child,classroom,knowledge,evidence:evidence.map(({storage_path,...e})=>e),media,history:[],professionalMemories:rankedMemories,analysisFrameworks:frameworks.map(f=>({id:f.id,frameworkType:f.framework_type,name:f.name,version:f.version,description:f.description,dimensions:f.dimensions})),peerAnalysisSummaries:[],prompt});assert.equal(analysisResultSchema.safeParse(generated.data).success,true);assert.equal(generated.promptVersion,'observation-analysis.qwen.v12');assert.ok(generated.diagnostics.schoolContextChars<=8000);assert.equal(generated.data.responsePlans.length,3);if(subjectIndex===0)assert.ok(generated.diagnostics.outputRepairFields.includes('responsePlans.0.activitySupport.activityName'));console.log(JSON.stringify({event:'full_provider_validation_passed',subjectIndex,scope:generated.data.analysisScope,facts:generated.data.facts.length,plans:generated.data.responsePlans.length,model:generated.model,diagnostics:generated.diagnostics}));}catch(e){console.log(JSON.stringify({event:'full_provider_validation_failed',subjectIndex,error:e.message,analysisCalls:calls,elapsedMs:Date.now()-began}));throw e;}
}
