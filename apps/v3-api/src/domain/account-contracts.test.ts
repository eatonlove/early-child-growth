import { expect,it } from 'vitest';
import { accountPasswordSchema,createAccountInput,teacherClassroomsInput } from './account-contracts.js';

it('reports password requirements without reducing password strength',() => {
  const invalid=accountPasswordSchema.safeParse('lowercase123');
  expect(invalid.success).toBe(false);
  if(!invalid.success) expect(invalid.error.issues[0]?.message).toContain('大写字母');
  expect(accountPasswordSchema.safeParse('ValidLocal123').success).toBe(true);
});

it('keeps researchers at school-wide scope and disallows duplicate classroom assignments',() => {
  const id='11111111-1111-4111-8111-111111111111';
  expect(createAccountInput.parse({username:' Research.Test ',displayName:'教研员',role:'researcher',password:'ValidLocal123',classroomIds:[id]}).classroomIds).toEqual([]);
  expect(teacherClassroomsInput.safeParse({classroomIds:[id,id]}).success).toBe(false);
  expect(teacherClassroomsInput.parse({classroomIds:[]}).classroomIds).toEqual([]);
});
