import { describe, expect, it } from 'vitest';
import { observationInput } from './observation-contracts.js';

const id = '11111111-1111-4111-8111-111111111111';
const valid = {
  classroomId: id, subjects: [{childId: id, role: 'primary'}], observerName: '虚构教师',
  occurredAt: '2026-10-14T09:30:00+08:00', scene: '建构区', theme: '搭桥',
  organizationStage: 'process', observationFocusCategory: 'materials_tools',
  teacherObservation: '幼儿选择积木并调整桥墩后再次测试。', teacherIdentification: '幼儿正在比较材料的稳定性。',
  teacherResponse: {category: 'material', strategy: '补充不同长度的积木。', nextObservationFocus: '观察幼儿如何比较桥墩位置。'},
};

describe('observation submission contract', () => {
  it('accepts a complete observation with omitted duration, and rejects the old blank-to-zero payload', () => {
    expect(observationInput.safeParse(valid).success).toBe(true);
    const result = observationInput.safeParse({...valid, durationMinutes: 0});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.durationMinutes).toEqual(['持续分钟至少为1；未记录时可以留空']);
  });

  it('explains why filled subject selections without a primary child are rejected', () => {
    const result = observationInput.safeParse({...valid, subjects: [{childId: id, role: 'participant'}]});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.subjects).toEqual(['必须且只能设置一名主要观察幼儿']);
  });

  it('identifies short trimmed text and nested response length errors', () => {
    const result = observationInput.safeParse({...valid, teacherIdentification: ' 已填写 ', teacherResponse: {...valid.teacherResponse, strategy: '应'.repeat(2001)}});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors).toMatchObject({
      teacherIdentification: ['教师识别至少需要5字（不含首尾空白）'],
      teacherResponse: ['教师原始应答不能超过2000字'],
    });
  });
});
