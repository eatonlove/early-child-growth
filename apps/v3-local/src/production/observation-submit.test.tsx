import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { remoteApi, RemoteApiError } from './api';
import { RemoteObservationV32Page } from './evolution-pages';
import type { RemoteUser } from './types';

const id = '11111111-1111-4111-8111-111111111111';
const user: RemoteUser = {id, tenantId: id, username: 'fictional', displayName: '虚构教师', role: 'teacher', tenantName: '测试园'};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openForm() {
  vi.spyOn(remoteApi, 'classrooms').mockResolvedValue({items: [{id, name: '中一班', grade: 'middle', academic_year: '2026', semester: '上期', status: 'active'}]});
  vi.spyOn(remoteApi, 'children').mockResolvedValue({items: [{id, classroom_id: id, internal_code: '001', display_name: '虚构幼儿', birth_month: '2022-01', guardian_consent_status: 'granted', interests: [], status: 'active'}]});
  vi.spyOn(remoteApi, 'observations').mockResolvedValue({items: []});
  vi.spyOn(remoteApi, 'observationImports').mockResolvedValue({items: []});
  vi.spyOn(remoteApi, 'templates').mockResolvedValue({items: [], recommendation: {grade: 'middle', scene: '建构区', matched: false}});
  vi.spyOn(remoteApi, 'observers').mockResolvedValue({items: []});
  render(<RemoteObservationV32Page user={user} />);
  fireEvent.click(await screen.findByRole('button', {name: '新建观察'}));
  fireEvent.click(screen.getByRole('button', {name: /网页直接填写/}));
  const dialog = screen.getByRole('dialog', {name: '新建标准观察'});
  fireEvent.click(await within(dialog).findByRole('checkbox', {name: '虚构幼儿 001'}));
  expect(within(dialog).getByText('已选 1 名')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('游戏主题'), {target: {value: '搭桥'}});
  fireEvent.change(within(dialog).getByLabelText('客观白描（含关键幼儿原话，10–12000字）'), {target: {value: '幼儿选择积木并调整桥墩后再次测试。'}});
  fireEvent.change(within(dialog).getByLabelText('教师识别（5–6000字）'), {target: {value: '幼儿正在比较材料。'}});
  fireEvent.change(within(dialog).getByLabelText('教师原始应答（2–2000字）'), {target: {value: '补充积木'}});
  fireEvent.change(within(dialog).getByLabelText('下一次观察重点（2–1000字）'), {target: {value: '比较桥墩位置'}});
  return dialog;
}

it('keeps the failed draft open and shows the exact backend field error inside it', async () => {
  const create = vi.spyOn(remoteApi, 'createObservation').mockRejectedValue(new RemoteApiError(422, 'VALIDATION_ERROR', '提交内容不完整或格式不正确', {teacherResponse: ['教师原始应答不能超过2000字']}));
  const dialog = await openForm();
  fireEvent.click(within(dialog).getByRole('button', {name: '保存教师观察'}));
  await waitFor(() => expect(create).toHaveBeenCalled());
  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('教师原始应答不能超过2000字'));
  expect(within(dialog).getByLabelText('游戏主题')).toHaveValue('搭桥');
});

it('omits a blank optional duration from the submitted payload', async () => {
  const create = vi.spyOn(remoteApi, 'createObservation').mockRejectedValue(new RemoteApiError(503, 'UNAVAILABLE', '测试暂停保存'));
  const dialog = await openForm();
  fireEvent.change(within(dialog).getByLabelText('持续分钟（可选，1–240的整数）'), {target: {value: ''}});
  fireEvent.click(within(dialog).getByRole('button', {name: '保存教师观察'}));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({durationMinutes: undefined, subjects: [expect.objectContaining({role: 'primary'})]})));
});
