import { z } from 'zod';

export const accountPasswordSchema = z.string()
  .min(10,'密码至少需要10位')
  .max(128,'密码不能超过128位')
  .regex(/[a-z]/,'密码需要包含小写字母')
  .regex(/[A-Z]/,'密码需要包含大写字母')
  .regex(/[0-9]/,'密码需要包含数字');

const classroomIds = z.array(z.string().uuid('班级编号无效')).max(20,'最多分配20个班级')
  .refine(value => new Set(value).size === value.length,'不能重复选择同一班级');

export const createAccountInput = z.object({
  username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/,'账号需为3至40位字母、数字或 . _ -'),
  displayName:z.string().trim().min(1,'请填写显示姓名').max(40,'显示姓名不能超过40字'),
  role:z.enum(['teacher','researcher']),
  password:accountPasswordSchema,
  classroomIds:classroomIds.default([]),
}).transform(value => ({...value,classroomIds:value.role === 'researcher' ? [] : value.classroomIds}));

export const teacherClassroomsInput = z.object({classroomIds});
