import { expect, it } from 'vitest';
import { RemoteApiError } from './api';
import { changeObservationSubjectRole, observationSubmitError } from './observation-form';
import type { SubjectDraft } from './observation-import';

const subject = (childId: string, role: SubjectDraft['role']): SubjectDraft => ({childId, role, contextualFeature: '', evidenceAnchors: []});

it('keeps one primary child when their role changes, including a single child', () => {
  expect(changeObservationSubjectRole([subject('a', 'primary')], 'a', 'participant')[0].role).toBe('primary');
  const changed = changeObservationSubjectRole([subject('a', 'primary'), subject('b', 'incidental')], 'a', 'participant');
  expect(changed.map(item => item.role)).toEqual(['participant', 'primary']);
  expect(changeObservationSubjectRole(changed, 'a', 'primary').map(item => item.role)).toEqual(['primary', 'participant']);
});

it('surfaces all backend field errors instead of the generic submission message', () => {
  const message = observationSubmitError(new RemoteApiError(422, 'VALIDATION_ERROR', '提交内容不完整或格式不正确', {
    subjects: ['必须且只能设置一名主要观察幼儿'], teacherResponse: ['教师原始应答不能超过2000字'],
  }));
  expect(message).toContain('参与幼儿与主要观察对象：必须且只能设置一名主要观察幼儿');
  expect(message).toContain('教师原始应答不能超过2000字');
  expect(message).not.toContain('提交内容不完整或格式不正确');
});
