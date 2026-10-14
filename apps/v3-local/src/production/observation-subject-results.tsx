import {useState, type FormEvent} from 'react';
import {Modal, Panel, Badge} from '../components/ui';
import {remoteApi, RemoteApiError} from './api';
import type {RemoteObservationSubject, RemoteAnalysisSubjectResult} from './types';

const statusLabels = {queued: '待处理', processing: '分析中', completed: '已生成分析', needs_more_evidence: '待补充资料', failed: '可单独重试'} as const;
export function ObservationSubjectResults({observationId, subjects, results, canSupplement, active, onRefresh, onAnalyze}: {
  observationId: string; subjects: RemoteObservationSubject[]; results: RemoteAnalysisSubjectResult[];
  canSupplement: boolean; active: boolean; onRefresh: () => Promise<void>; onAnalyze: (childIds: string[]) => Promise<void>;
}) {
  const [target, setTarget] = useState<RemoteObservationSubject | null>(null);
  const [form, setForm] = useState({additionalObservation: '', contextualFeature: '', anchors: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = (subject: RemoteObservationSubject) => {setError(''); setTarget(subject); setForm({additionalObservation: subject.additional_observation ?? '', contextualFeature: subject.contextual_feature ?? '', anchors: (subject.evidence_anchors ?? []).join('\n')});};
  const analyze = async (ids: string[]) => {setBusy(true); setError(''); try {await onAnalyze(ids);} catch(reason) {setError(reason instanceof RemoteApiError ? reason.message : '分析发起失败，请重试');} finally {setBusy(false);}};
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!target) return;
    const childId = target.child_id;
    const anchors = form.anchors.split('\n').map(value => value.trim()).filter(Boolean);
    if (anchors.length > 20 || anchors.some(anchor => anchor.length > 160)) {setError('媒体定位最多20条，每条最多160字。'); return;}
    if (!form.additionalObservation.trim() && !form.contextualFeature.trim() && !anchors.length) {setError('请补充具体观察事实或媒体定位。'); return;}
    setBusy(true); setError('');
    try {
      await remoteApi.supplementObservationSubject(observationId, childId, {additionalObservation: form.additionalObservation, contextualFeature: form.contextualFeature, evidenceAnchors: anchors});
      await onRefresh();
      await onAnalyze([childId]);
      setTarget(null);
    } catch(reason) {setError(reason instanceof RemoteApiError ? reason.message : '补充或分析发起失败，请重试；已保存的补充说明会保留。');}
    finally {setBusy(false);}
  };
  if (!results.length) return null;
  return <Panel title="逐名分析与待补充资料" subtitle="资料充分的幼儿独立生成待审核分析；资料不足的幼儿先补充具体证据。">
    {error && !target && <div role="alert" className="remote-error">{error}</div>}
    <div className="evo-child-select">{subjects.map(subject => {
      const result = results.find(item => item.childId === subject.child_id);
      if (!result) return null;
      return <article key={subject.child_id}>
        <strong>{subject.display_name}</strong><Badge tone={result.status === 'completed' ? 'green' : result.status === 'failed' ? 'red' : 'orange'}>{statusLabels[result.status]}</Badge>
        <p>{result.explanation}</p>
        {subject.additional_observation && <details><summary>本次补充观察事实</summary><p>{subject.additional_observation}</p></details>}
        {result.missingInformation.length > 0 && <ul>{result.missingInformation.map((text, index) => <li key={index}>{text}</li>)}</ul>}
        {result.status === 'needs_more_evidence' && <><button className="btn btn-secondary" disabled={active || busy || !canSupplement} onClick={() => open(subject)}>补充{subject.display_name}的观察</button>{!canSupplement && <small>请由观察创建教师或教研员补充。</small>}</>}
        {result.status === 'failed' && <button className="btn btn-secondary" disabled={active || busy} onClick={() => void analyze([subject.child_id])}>只重试{subject.display_name}</button>}
      </article>;
    })}</div>
    {target && <Modal wide title={`补充${target.display_name}的观察证据`} description="只补充本次实际发生的动作、原话或互动过程。以后新发生的行为请另建观察，避免混淆时间。" onClose={() => {if (!busy) setTarget(null);}}>
      <form className="remote-form" onSubmit={save}>
        {error && <div className="remote-error full-field" role="alert">{error}</div>}
        <label className="full-field"><span>本次补充观察事实</span><textarea rows={5} maxLength={6000} value={form.additionalObservation} onChange={event => setForm({...form, additionalObservation: event.target.value})} placeholder="该幼儿具体做了什么、说了什么、怎样尝试或互动" /></label>
        <label className="full-field"><span>本次个体特征</span><input maxLength={500} value={form.contextualFeature} onChange={event => setForm({...form, contextualFeature: event.target.value})} placeholder="衣着、位置或任务，帮助区分目标幼儿" /></label>
        <label className="full-field"><span>媒体定位 每行一条</span><small>最多20条，每条最多160字。</small><textarea rows={3} value={form.anchors} onChange={event => setForm({...form, anchors: event.target.value})} placeholder="视频00:04至00:20，画面左侧黄色上衣幼儿" /></label>
        <p className="full-field">保存后只分析这名幼儿，其他幼儿已生成的结果保留。照片或视频可先通过本观察的附件入口补充。</p>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '正在保存与发起分析…' : '保存补充并单独分析'}</button>
      </form>
    </Modal>}
  </Panel>;
}
