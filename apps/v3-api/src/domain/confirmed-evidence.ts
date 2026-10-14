interface ConfirmedAnalysis {id?: string; observation_id: string; child_id: string; decision: string; generated_at?: string}
export function latestAdoptedAnalyses<T extends ConfirmedAnalysis>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (row.decision !== 'adopted') continue;
    const key = `${row.observation_id}:${row.child_id}`, prior = latest.get(key);
    if (!prior || (row.generated_at ?? '') > (prior.generated_at ?? '') || (row.generated_at ?? '') === (prior.generated_at ?? '') && (row.id ?? '') > (prior.id ?? '')) latest.set(key, row);
  }
  return [...latest.values()];
}
export function confirmedObservations<T extends {id: string}>(observations: T[], analyses: ConfirmedAnalysis[], childId?: string): T[] {
  const ids = new Set(analyses.filter(row => row.decision === 'adopted' && (!childId || row.child_id === childId)).map(row => row.observation_id));
  return observations.filter(row => ids.has(row.id));
}
export function confirmedParticipantIds(analyses: ConfirmedAnalysis[], observationId: string): string[] {
  return [...new Set(analyses.filter(row => row.decision === 'adopted' && row.observation_id === observationId).map(row => row.child_id))];
}
