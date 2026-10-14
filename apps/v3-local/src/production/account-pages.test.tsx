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
function setup(onCurrentUserNameChange?: (name:string)=>void){
  vi.spyOn(remoteApi,'accounts').mockResolvedValue({items:[teacher,admin]});
  vi.spyOn(remoteApi,'classrooms').mockResolvedValue({items:classrooms});
  render(<RemoteAccountsPage currentUser={user} onCurrentUserNameChange={onCurrentUserNameChange}/>);
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

it('toggles the initial password without submitting and resets visibility on reopen',async()=>{
  const create=vi.spyOn(remoteApi,'createAccount');setup();
  fireEvent.click(screen.getByRole('button',{name:'新增账号'}));
  const password=screen.getByLabelText('初始密码');
  fireEvent.change(password,{target:{value:'ValidLocal123'}});
  expect(password).toHaveAttribute('type','password');
  fireEvent.click(screen.getByRole('button',{name:'显示初始密码'}));
  expect(password).toHaveAttribute('type','text');
  expect(password).toHaveValue('ValidLocal123');
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'隐藏初始密码'}));
  expect(password).toHaveAttribute('type','password');
  fireEvent.click(screen.getByRole('button',{name:'显示初始密码'}));
  fireEvent.click(screen.getByRole('button',{name:'关闭'}));
  fireEvent.click(screen.getByRole('button',{name:'新增账号'}));
  expect(screen.getByLabelText('初始密码')).toHaveAttribute('type','password');
});

it('saves a display name and preserves the teacher classroom assignment',async()=>{
  const save=vi.spyOn(remoteApi,'updateAccountDisplayName').mockResolvedValue({item:{...teacher,display_name:'新老师'}});setup();
  fireEvent.click((await screen.findAllByRole('button',{name:'修改名称'}))[0]);
  const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'  新老师  '}});
  fireEvent.click(within(dialog).getByRole('button',{name:'保存显示名称'}));
  await waitFor(()=>expect(save).toHaveBeenCalledExactlyOnceWith('teacher','新老师'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('新老师',{exact:true})).toBeInTheDocument();
  expect(screen.getByText('中一班',{exact:true})).toBeInTheDocument();
  expect(screen.getByText('全园',{exact:true})).toBeInTheDocument();
});

it('validates empty names and keeps the rename dialog open on API failure',async()=>{
  const save=vi.spyOn(remoteApi,'updateAccountDisplayName').mockRejectedValue(new RemoteApiError(503,'UNAVAILABLE','名称保存暂时不可用'));setup();
  fireEvent.click((await screen.findAllByRole('button',{name:'修改名称'}))[0]);
  const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'  '}});
  fireEvent.click(within(dialog).getByRole('button',{name:'保存显示名称'}));
  expect(save).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('alert')).toHaveTextContent('1至40字');
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'新老师'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'保存显示名称'}));
  await waitFor(()=>expect(within(dialog).getByRole('alert')).toHaveTextContent('名称保存暂时不可用'));
  expect(within(dialog).getByLabelText('显示姓名')).toHaveValue('新老师');
});

it('updates the current researcher name without changing school-wide access',async()=>{
  const notify=vi.fn();vi.spyOn(remoteApi,'updateAccountDisplayName').mockResolvedValue({item:{...admin,display_name:'新教研员'}});setup(notify);
  fireEvent.click((await screen.findAllByRole('button',{name:'修改名称'}))[1]);
  const dialog=screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('显示姓名'),{target:{value:'新教研员'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'保存显示名称'}));
  await waitFor(()=>expect(notify).toHaveBeenCalledExactlyOnceWith('新教研员'));
  expect(screen.getByText('全园',{exact:true})).toBeInTheDocument();
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
