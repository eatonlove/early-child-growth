import { RemoteApiError } from './api';

export function passwordProblem(password:string) {
  if(password.length < 10) return '密码至少需要10位，并包含大写字母、小写字母和数字';
  if(password.length > 128) return '密码不能超过128位';
  const missing=[!/[A-Z]/.test(password) && '大写字母',!/[a-z]/.test(password) && '小写字母',!/[0-9]/.test(password) && '数字'].filter(Boolean);
  return missing.length ? `密码需要包含${missing.join('、')}` : '';
}

export function accountFormProblem(form:{username:string;displayName:string;password:string}) {
  if(!/^[a-z0-9._-]{3,40}$/i.test(form.username.trim())) return '登录账号需为3至40位字母、数字或 . _ -';
  if(!form.displayName.trim()) return '请填写显示姓名';
  if(form.displayName.trim().length > 40) return '显示姓名不能超过40字';
  return passwordProblem(form.password);
}

export function accountErrorMessage(reason:unknown) {
  if(reason instanceof RemoteApiError) {
    const fields=Object.entries(reason.fields || {}).filter(([,messages]) => messages.length);
    if(fields.length) return fields.map(([field,messages]) => {
      const fallbacks:Record<string,string>={username:'请使用3至40位字母、数字或 . _ - 作为登录账号',displayName:'请填写1至40字的显示姓名',password:'密码需为10至128位，并包含大写字母、小写字母和数字',classroomIds:'请选择有效且不重复的班级'};
      const chinese=messages.filter(message => /[\u4e00-\u9fff]/.test(message));
      return chinese.length ? chinese.join('；') : fallbacks[field] || '请检查填写内容';
    }).join('；');
    return reason.message;
  }
  return '操作失败，请稍后重试';
}
