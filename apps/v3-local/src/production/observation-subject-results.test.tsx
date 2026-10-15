import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {remoteApi} from './api';
import {ObservationSubjectResults} from './observation-subject-results';
import type {RemoteObservationSubject, RemoteAnalysisSubjectResult} from './types';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const subjects = [{id: a, observation_id: "observation", child_id: a, display_name: '幼儿甲', role: 'primary', contextual_feature: '', evidence_anchors: []}, {id: b, observation_id: "observation", child_id: b, display_name: '幼儿乙', role: 'participant', contextual_feature: '', evidence_anchors: []}] as RemoteObservationSubject[];
const results: RemoteAnalysisSubjectResult[] = [{childId: a, status: 'completed', explanation: '已生成个人分析。', missingInformation: [], analysisRunId: a}, {childId: b, status: 'needs_more_evidence', explanation: '没有记录乙的动作。', missingInformation: ['补充乙的实际动作或关键原话。'], analysisRunId: null}];
afterEach(() => {cleanup(); vi.restoreAllMocks();});
it('shows the completed subject and a separate missing-evidence checklist', () => {
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={results} canSupplement active={false} onRefresh={vi.fn()} onAnalyze={vi.fn()}/>);
  expect(screen.getByText('已生成分析')).toBeInTheDocument();
  expect(screen.getByText('可先分析')).toBeInTheDocument();
  const card = screen.getByRole('article', {name: '幼儿乙的分析进度'});
  expect(within(card).getByRole('heading', {name: '幼儿乙', level: 3})).toBeInTheDocument();
  expect(within(card).getByRole('list', {name: '可补充资料'})).toHaveTextContent('补充乙的实际动作或关键原话。');
  expect(card.parentElement).toHaveClass('subject-result-grid');
  expect(card.closest('.evo-child-select')).toBeNull();
});
it('saves a teacher supplement and then analyzes only that child', async () => {
  const save = vi.spyOn(remoteApi, 'supplementObservationSubject').mockResolvedValue({item: subjects[1]});
  const refresh = vi.fn(async () => {}), analyze = vi.fn(async () => {});
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={results} canSupplement active={false} onRefresh={refresh} onAnalyze={analyze}/>);
  fireEvent.click(screen.getByRole('button', {name: '补充幼儿乙的观察'}));
  const dialog = screen.getByRole('dialog', {name: '补充幼儿乙的观察证据'});
  fireEvent.change(within(dialog).getByLabelText('本次补充观察事实'), {target: {value: '幼儿乙移动木板后又推车测试。'}});
  fireEvent.click(within(dialog).getByRole('button', {name: '保存补充并单独分析'}));
  await waitFor(() => expect(save).toHaveBeenCalledWith('observation', b, {additionalObservation: '幼儿乙移动木板后又推车测试。', contextualFeature: '', evidenceAnchors: []}));
  await waitFor(() => expect(analyze).toHaveBeenCalledWith([b]));
  expect(analyze).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalled();
});
it('only retries the failed child and leaves the completed peer unchanged', async () => {
  const analyze = vi.fn(async () => {});
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={[results[0], {...results[1], status: 'failed', missingInformation: []}]} canSupplement active={false} onRefresh={vi.fn()} onAnalyze={analyze}/>);
  const card = screen.getByRole('article', {name: '幼儿乙的分析进度'});
  fireEvent.click(within(card).getByRole('button', {name: '只重试幼儿乙'}));
  await waitFor(() => expect(analyze).toHaveBeenCalledWith([b]));
  expect(analyze).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('article', {name: '幼儿甲的分析进度'})).toHaveTextContent('已生成分析');
});
it('keeps the supplement action disabled and explains the teacher permission boundary', () => {
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={results} canSupplement={false} active={false} onRefresh={vi.fn()} onAnalyze={vi.fn()}/>);
  expect(screen.getByRole('button', {name: '补充幼儿乙的观察'})).toBeDisabled();
  expect(screen.getByText('请由观察创建教师或教研员补充。')).toBeInTheDocument();
});
it('disables retry and supplement actions while another analysis is active', () => {
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={[{...results[0], status: 'failed'}, results[1]]} canSupplement active onRefresh={vi.fn()} onAnalyze={vi.fn()}/>);
  expect(screen.getByRole('button', {name: '只重试幼儿甲'})).toBeDisabled();
  expect(screen.getByRole('button', {name: '补充幼儿乙的观察'})).toBeDisabled();
});
it('lets a previously blocked subject analyze existing material without first opening a supplement form', async () => {
  const analyze = vi.fn(async () => {});
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={results} canSupplement active={false} onRefresh={vi.fn()} onAnalyze={analyze}/>);
  fireEvent.click(screen.getByRole('button', {name: '先用幼儿乙的现有资料分析'}));
  await waitFor(() => expect(analyze).toHaveBeenCalledWith([b]));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('shows successful context analysis with optional supplements instead of a blocked state', () => {
  render(<ObservationSubjectResults observationId="observation" subjects={subjects} results={[results[0], {...results[1], status: 'completed', analysisScope: 'context_only', analysisRunId: b}]} canSupplement active={false} onRefresh={vi.fn()} onAnalyze={vi.fn()}/>);
  const card = screen.getByRole('article', {name: '幼儿乙的分析进度'});
  expect(within(card).getByText('已生成情境分析')).toBeInTheDocument();
  expect(within(card).getByText('不影响查看和使用本次建议，可按需要补充。')).toBeInTheDocument();
  expect(within(card).getByRole('button', {name: '补充幼儿乙的观察'})).toBeEnabled();
  expect(within(card).queryByText('可先分析')).not.toBeInTheDocument();
});
