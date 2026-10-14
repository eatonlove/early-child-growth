import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {remoteApi} from './api';
import {ResourceLibrarySection} from './resource-library-section';
import type {RemoteCurriculumResourcePackage,RemoteResourceCategoryAnalysis,RemoteUser} from './types';

const user:RemoteUser={id:'test-admin',tenantId:'test-tenant',username:'test-admin',displayName:'虚构教研员',role:'researcher',tenantName:'虚构园所'};
const resource:RemoteCurriculumResourcePackage={id:'test-resource',title:'虚构合作搭桥',summary:'课程关注材料比较与合作',activity_origin:'课程关注材料比较与合作',category:'growth',applicable_grades:['middle'],themes:['搭桥'],status:'active',creator_name:'虚构教研员',created_by:user.id,created_at:'2026-10-14T09:00:00+08:00',updated_at:'2026-10-14T09:00:00+08:00',assets:[]};
const failed:RemoteResourceCategoryAnalysis={id:'test-analysis',category:'growth',status:'failed',source_package_ids:[resource.id],created_at:'2026-10-14T09:01:00+08:00',completed_at:'2026-10-14T09:02:00+08:00',provider:null,model:'selected-model',prompt_version:'resource-category-analysis.qwen.v1',error_message:'千问输出触发幼儿标签化风险守卫：落后',result:null};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(item:RemoteResourceCategoryAnalysis){
  vi.spyOn(remoteApi,'curriculumResourcePackages').mockResolvedValue({items:[resource]});
  const read=vi.spyOn(remoteApi,'resourceCategoryAnalysis').mockResolvedValue({item});
  const analyze=vi.spyOn(remoteApi,'analyzeResourceCategory');
  render(<ResourceLibrarySection user={user} onChange={vi.fn().mockResolvedValue(undefined)}/>);
  fireEvent.click(screen.getByRole('button',{name:/悦生长/}));
  return {read,analyze};
}

it('shows a teacher-readable historical safety error without automatically calling AI',async()=>{
  const {analyze}=setup(failed);
  expect(await screen.findByRole('alert')).toHaveTextContent('课程资料已保留');
  expect(screen.getByRole('alert')).not.toHaveTextContent('千问输出触发');
  expect(analyze).not.toHaveBeenCalled();
  await waitFor(()=>expect(screen.getByRole('button',{name:'分析当前分类'})).toBeEnabled());
});

it('retries only on a click and renders the new result',async()=>{
  const {read,analyze}=setup(failed);
  await screen.findByRole('alert');
  await waitFor(()=>expect(screen.getByRole('button',{name:'分析当前分类'})).toBeEnabled());
  const completed:RemoteResourceCategoryAnalysis={...failed,status:'completed',error_message:null,provider:'QianwenAIProvider',result:{directionalContent:[{title:'合作与材料探究',description:'关注搭桥时的协商和比较。',sourcePackageIds:[resource.id]}],indicatorFocus:[{name:'协商意图',focus:'关注后续如何表达分工意图。',observableBehaviors:['记录下一轮分工协商行为。'],sourcePackageIds:[resource.id]}],limitations:[]}};
  read.mockResolvedValue({item:completed});
  analyze.mockResolvedValue({item:{...failed,status:'queued',error_message:null,completed_at:null}});
  fireEvent.click(screen.getByRole('button',{name:'分析当前分类'}));
  expect(await screen.findByText('合作与材料探究')).toBeInTheDocument();
  expect(analyze).toHaveBeenCalledExactlyOnceWith('growth');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves actionable non-safety errors instead of misclassifying them',async()=>{
  const {analyze}=setup({...failed,error_message:'当前分类未提取到课程正文，请补充可解析的Word或PDF文字资料'});
  expect(await screen.findByRole('alert')).toHaveTextContent('未提取到课程正文');
  expect(screen.getByRole('alert')).not.toHaveTextContent('安全校验');
  expect(analyze).not.toHaveBeenCalled();
});
