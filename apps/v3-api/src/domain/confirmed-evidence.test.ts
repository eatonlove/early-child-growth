import {expect, it} from 'vitest';
import {confirmedObservations, confirmedParticipantIds, latestAdoptedAnalyses} from './confirmed-evidence.js';
const rows = [{id:'accepted-a', observation_id:'o', child_id:'a', decision:'adopted', generated_at:'2026-10-14T09:00:00Z'}, {id:'pending-b', observation_id:'o', child_id:'b', decision:'pending', generated_at:'2026-10-14T10:00:00Z'}];
it('keeps individually adopted evidence while the shared observation waits for another child', () => {
  const observations = [{id:'o', status:'ai_ready'}, {id:'unrelated', status:'adopted'}];
  expect(confirmedObservations(observations, rows, 'a')).toEqual([observations[0]]);
  expect(confirmedObservations(observations, rows, 'b')).toEqual([]);
  expect(confirmedParticipantIds(rows, 'o')).toEqual(['a']);
});
it('keeps the last adopted version until a new version is adopted', () => {
  const pending = {...rows[0]!, id:'draft-a', decision:'pending', generated_at:'2026-10-14T11:00:00Z'};
  expect(latestAdoptedAnalyses([...rows, pending])).toEqual([rows[0]]);
  const accepted = {...pending, decision:'adopted'};
  expect(latestAdoptedAnalyses([...rows, accepted])).toEqual([accepted]);
});
it('keeps context-only support drafts out of personal growth and report evidence, even when adopted', () => {
  const context = {...rows[0]!, id: 'context-b', child_id: 'b', structured_result: {analysisScope: 'context_only'}};
  expect(latestAdoptedAnalyses([...rows, context])).toEqual([rows[0]]);
  expect(confirmedObservations([{id: 'o'}], [context], 'b')).toEqual([]);
  expect(confirmedParticipantIds([context], 'o')).toEqual([]);
  const newerContext = {...context, child_id: 'a', generated_at: '2026-10-15T09:00:00Z'};
  expect(latestAdoptedAnalyses([rows[0]!, newerContext])).toEqual([rows[0]]);
});
