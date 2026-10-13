import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { remoteApi,RemoteApiError } from './api';
import { RemoteAccountsPage } from './pages';
import type { RemoteAccount,RemoteClassroom,RemoteUser } from './types';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const user:RemoteUser={id:'admin',tenantId:'tenant',username:'admin',displayName:'教研员',role:'researcher',tenantName:'演示园所'};
const teacher:RemoteAccount={user_id:'teacher',username:'teacher',display_name:'虚构老师',role:'teacher',status:'active',classroom_ids:[a]};
const admin:RemoteAccount={user_id:'admin',username:'admin',display_name:'教研员',role:'researcher',status:'active',classroom_ids:[]};
const classrooms:RemoteClassroom[]=[{id:a,name:'中一班',grade:'middle',academic_year:'2026',semester:'上期',status:'active'},{id:b,name:'中二班',grade:'middle',academic_year:'2026',semester:'上期',status:'active'}];
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(){
  vi.spyOn(remoteApi,'accounts').mockResolvedValue({items:[teacher,admin]});
  vi.spyOn(remoteApi,'classrooms').mockResolvedValue({items:classrooms});
  render(<RemoteAccountsPage currentUser={user}/>);
}

it('shows password validation inside the creation dialog without sending invalid requests',async()=>{
  const create=vi.spyOn(remoteApi,'createAccount');setup();
  fireEvent.click(screen.getByRole('button',{name:'新增账号'}));
  const dialog=screen.getByRole('dialog',{name:'新增系统账号'});
  fireEvent.change(within(dialog).getByLabelText('登录账号'),{target:{value:'example123'}});
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'虚构老师'}});
  fireEvent.change(within(dialog).getByLabelText('初始密码'),{target:{value:'lowercase123'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'创建账号'}));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('大写字母');
  expect(create).not.toHaveBeenCalled();
});

it('shows backend field errors in the open dialog',async()=>{
  vi.spyOn(remoteApi,'createAccount').mockRejectedValue(new RemoteApiError(422,'VALIDATION_ERROR','格式不正确',{password:['密码需要包含大写字母']}));setup();
  fireEvent.click(screen.getByRole('button',{name:'新增账号'}));
  const dialog=screen.getByRole('dialog',{name:'新增系统账号'});
  fireEvent.change(within(dialog).getByLabelText('登录账号'),{target:{value:'example123'}});
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'虚构老师'}});
  fireEvent.change(within(dialog).getByLabelText('初始密码'),{target:{value:'ValidLocal123'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'创建账号'}));
  await waitFor(()=>expect(within(dialog).getByRole('alert')).toHaveTextContent('大写字母'));
});

it('edits only teacher scope and updates the displayed classroom assignment',async()=>{
  const update=vi.spyOn(remoteApi,'updateAccountClassrooms').mockResolvedValue({item:{...teacher,classroom_ids:[b]}});setup();
  const button=await screen.findByRole('button',{name:'编辑班级范围'});
  expect(screen.getAllByRole('button',{name:'编辑班级范围'})).toHaveLength(1);
  expect(screen.getByText('全园',{exact:true})).toBeInTheDocument();
  fireEvent.click(button);
  const dialog=screen.getByRole('dialog',{name:'编辑虚构老师的班级范围'});
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'中一班'}));
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'中二班'}));
  fireEvent.click(within(dialog).getByRole('button',{name:'保存班级范围'}));
  await waitFor(()=>expect(update).toHaveBeenCalledWith('teacher',[b]));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('中二班',{exact:true})).toBeInTheDocument();
});
