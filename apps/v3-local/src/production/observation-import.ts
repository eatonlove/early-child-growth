import type {RemoteChild, RemoteObservationImport} from './types';

export type SubjectDraft = {childId:string;role:'primary'|'participant'|'incidental';contextualFeature:string;evidenceAnchors:string[]};

export function matchImportedSubjects(item:RemoteObservationImport,children:RemoteChild[],classroomId=item.classroom_id):SubjectDraft[] {
  const matched:SubjectDraft[]=[];
  for(const subject of item.extracted_fields.subjects??[]) {
    const candidates=children.filter(child=>child.classroom_id===classroomId&&child.status==='active'&&child.display_name.trim()===subject.displayName.trim());
    if(candidates.length!==1||matched.some(value=>value.childId===candidates[0].id))continue;
    matched.push({childId:candidates[0].id,role:matched.length===0?'primary':subject.role==='primary'?'participant':subject.role,contextualFeature:subject.contextualFeature,evidenceAnchors:[]});
  }
  return matched;
}

const fieldLabels:Record<string,string>={
  classroomChildren:'班级幼儿名单',subjects:'参与幼儿',organizationStage:'游戏阶段',
  occurredAtText:'发生时间',occurrreAtText:'发生时间',observerName:'观察教师',
  objectiveObservation:'客观观察',teacherIdentification:'教师识别',teacherResponseDraft:'教师应答',
  nextObservationFocus:'下次观察重点',observationFocusCategory:'观察聚焦',
  unlistedParticipantCount:'未列名参与人数',groupContext:'群体情境',fieldConfidence:'解析提示',
  materials_tools:'材料与工具',cognition_experience:'认知与经验',social_experience:'交往与规则',
  participant:'共同参与',primary:'主要观察',incidental:'偶发参与',
  introduction:'游戏导入',evaluation:'游戏评价',process:'游戏过程',sharing:'游戏分享',plan:'游戏计划',
};

export function readableImportWarning(warning:string) {
  return warning.replace(/\(?\bid\s*:\s*[a-f\d-]{36}\)?/gi,'')
    .replace(/[a-zA-Z][a-zA-Z_]+/g,token=>fieldLabels[token]??(token==='ISO'?'标准日期格式':token))
    .replace(/，?置信度(?:已)?降低/g,'，请教师核对').replace(/\s+/g,' ').trim();
}

export function importReviewNotes(item:RemoteObservationImport,children:RemoteChild[],classroomId:string) {
  const notes=(item.extracted_fields.warnings??[]).map(readableImportWarning);
  if(!item.extracted_fields.observationFocusCategory)notes.push('原表未明确观察聚焦，请在上方选择一项，不自动猜测。');
  if(!item.extracted_fields.occurredAtText)notes.push('原表未识别发生时间，请填写真实观察时间，不使用上传时间代替。');
  for(const subject of item.extracted_fields.subjects??[]) {
    const matches=children.filter(child=>child.classroom_id===classroomId&&child.status==='active'&&child.display_name.trim()===subject.displayName.trim());
    if(matches.length!==1)notes.push(matches.length>1?`“${subject.displayName}”存在同名幼儿，请按班内编号手动确认。`:`“${subject.displayName}”未匹配到当前班级幼儿，请核对班级并手动选择。`);
  }
  return [...new Set(notes.filter(Boolean))];
}
