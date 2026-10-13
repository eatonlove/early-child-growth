import {describe,expect,it} from 'vitest';
import {importReviewNotes,matchImportedSubjects,readableImportWarning} from './observation-import';
import type {RemoteChild,RemoteObservationImport} from './types';

const item={id:'import',classroom_id:'class',extracted_fields:{subjects:[{displayName:'虚构幼儿',contextualFeature:'绿色衣服',role:'primary'}],warnings:['classroomChildren为空，subjects字段置信度降低','organizationStage映射为process需教师复核']}} as RemoteObservationImport;
const child={id:'child',classroom_id:'class',display_name:'虚构幼儿',status:'active'} as RemoteChild;
describe('observation import review',()=>{
  it('does not select a random first child when names are unmatched or ambiguous',()=>{
    expect(matchImportedSubjects(item,[])).toEqual([]);
    expect(matchImportedSubjects(item,[{...child,display_name:'其他幼儿'}])).toEqual([]);
    expect(matchImportedSubjects(item,[child,{...child,id:'duplicate'}])).toEqual([]);
    expect(importReviewNotes(item,[child,{...child,id:'duplicate'}],'class').join('')).toContain('同名幼儿');
  });
  it('matches only active children from the selected class and keeps one primary',()=>{
    expect(matchImportedSubjects(item,[child,{...child,id:'foreign',classroom_id:'foreign'}])).toEqual([{childId:'child',role:'primary',contextualFeature:'绿色衣服',evidenceAnchors:[]}]);
    expect(matchImportedSubjects(item,[{...child,status:'archived'}])).toEqual([]);
  });
  it('shows readable Chinese review notes without internal IDs or field names',()=>{
    const warnings=importReviewNotes(item,[],'class').join('');
    expect(warnings).not.toMatch(/classroomChildren|subjects|organizationStage|process/);
    expect(warnings).toContain('参与幼儿');
    expect(warnings).toContain('未匹配');
    expect(readableImportWarning('参与者(id:25c10e9b-49ec-4b8d-9e58-47f82ddaa396)请复核')).not.toContain('25c10e9b');
  });
});
