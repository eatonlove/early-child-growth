import { RemoteApiError } from './api';
import type { SubjectDraft } from './observation-import';

const fieldLabels: Record<string, string> = {
  classroomId: '班级', childId: '观察幼儿', subjects: '参与幼儿与主要观察对象',
  templateId: '观察模板', sourceImportId: '导入记录', observerName: '观察教师',
  observerIds: '协同观察者账号', occurredAt: '发生时间', durationMinutes: '持续分钟',
  scene: '游戏场地', theme: '游戏主题', organizationStage: '组织阶段',
  observationFocusCategory: '观察聚焦', observationFocus: '观察重点',
  groupContext: '群体情境', unlistedParticipantCount: '未列名参与人数',
  teacherObservation: '客观白描', teacherIdentification: '教师识别', teacherResponse: '教师原始应答或下一次观察重点',
};

export function observationSubmitError(reason: unknown): string {
  if (!(reason instanceof RemoteApiError)) return '操作失败，请稍后重试';
  const details = Object.entries(reason.fields ?? {}).flatMap(([field, messages]) =>
    messages.map(message => `${fieldLabels[field] ?? '表单内容'}：${message}`));
  return details.length ? `请检查以下内容：${details.join('；')}` : reason.message;
}

// Moving the primary child to another role also transfers the primary role.
// A single selected child must remain primary.
export function changeObservationSubjectRole(subjects: SubjectDraft[], childId: string, role: SubjectDraft['role']): SubjectDraft[] {
  if (!subjects.some(subject => subject.childId === childId)) return subjects;
  const next = subjects.map(subject => subject.childId === childId ? { ...subject, role }
    : role === 'primary' && subject.role === 'primary' ? { ...subject, role: 'participant' as const } : subject);
  if (!next.some(subject => subject.role === 'primary')) {
    const replacement = next.find(subject => subject.childId !== childId) ?? next[0];
    return next.map(subject => subject === replacement ? { ...subject, role: 'primary' } : subject);
  }
  return next;
}
