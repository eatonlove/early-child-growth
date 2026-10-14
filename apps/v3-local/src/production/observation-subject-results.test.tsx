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
  expect(screen.getByText('待补充资料')).toBeInTheDocument();
  expect(screen.getByText('补充乙的实际动作或关键原话。')).toBeInTheDocument();
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
