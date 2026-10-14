import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Download, Eye, RefreshCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Badge, EmptyState, Modal, Panel } from '../components/ui';
import { remoteApi } from './api';
import type { GradeCode, RemoteCurriculumResourcePackage, RemoteResourceCategoryAnalysis, RemoteUser, ResourceCategory, ResourcePreview } from './types';

const categories = {life:'懂生活',creation:'慧创生',growth:'悦生长'} as const;
const grades = {small:'小班',middle:'中班',large:'大班'} as const;
const fileLabels = {plan:'课程计划',materials:'课程材料',booklet:'课程手册',supplement:'补充资料'} as const;
const statusLabels = {draft:'上传未完成',pending:'待教研审核',active:'已入库',rejected:'已退回',disabled:'已停用'} as const;
const errorText = (reason:unknown) => reason instanceof Error ? reason.message : '操作失败，请重试';
const categoryErrorText = (message:string | null) => message?.startsWith('千问输出触发幼儿标签化风险守卫')
  ? '分析草稿含有不适合评价幼儿的表述，未通过安全校验。课程资料已保留，请点击“分析当前分类”重试。'
  : message || '分析失败，请重新发起';
const splitLines = (text:string) => text.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
const emptyFiles = () => ({plan:null as File | null,materials:null as File | null,booklet:null as File | null,supplements:[] as File[]});

export function ResourceLibrarySection({user,onChange}:{user:RemoteUser;onChange:()=>Promise<void>}) {
  const [packages,setPackages] = useState<RemoteCurriculumResourcePackage[]>([]);
  const [category,setCategory] = useState<ResourceCategory | 'all' | 'unclassified'>('all');
  const [detail,setDetail] = useState<RemoteCurriculumResourcePackage | null>(null);
  const [analysis,setAnalysis] = useState<RemoteResourceCategoryAnalysis | null>(null);
  const [analysisRefresh,setAnalysisRefresh] = useState(0);
  const [editor,setEditor] = useState<RemoteCurriculumResourcePackage | 'new' | null>(null);
  const [form,setForm] = useState({title:'',activityOrigin:'',category:'life' as ResourceCategory,grades:['middle'] as GradeCode[],themes:''});
  const [files,setFiles] = useState(emptyFiles);
  const [preview,setPreview] = useState<ResourcePreview | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [progress,setProgress] = useState('');
  const [skipAvailable,setSkipAvailable] = useState(false);
  const load = async() => { const result = await remoteApi.curriculumResourcePackages(); setPackages(result.items); };
  useEffect(() => { void load().catch((reason) => setError(errorText(reason))); },[]);
  useEffect(() => {
    let cancelled = false; let timer:ReturnType<typeof setTimeout>;
    setAnalysis(null);
    if(category === 'all' || category === 'unclassified') return;
    const poll = async() => {
      try { const result = await remoteApi.resourceCategoryAnalysis(category); if(cancelled) return; setAnalysis(result.item); if(result.item && ['queued','processing'].includes(result.item.status)) timer = setTimeout(poll,2500); }
      catch(reason) { if(!cancelled) setError(errorText(reason)); }
    };
    void poll();
    return () => {cancelled=true;clearTimeout(timer);};
  },[category,analysisRefresh]);
  const run = async(operation:()=>Promise<void>) => { setBusy(true);setError('');try {await operation();} catch(reason) {setError(errorText(reason));} finally {setBusy(false);} };
  const openEditor = (item:RemoteCurriculumResourcePackage | 'new') => {
    setEditor(item);setFiles(emptyFiles());setProgress('');setSkipAvailable(false);setError('');
    setForm(item === 'new' ? {title:'',activityOrigin:'',category:category === 'all' || category === 'unclassified' ? 'life' : category,grades:['middle'],themes:''} : {title:item.title,activityOrigin:item.activity_origin || item.summary,category:item.category || 'life',grades:item.applicable_grades,themes:item.themes.join('，')});
  };
  const canManage = (item:RemoteCurriculumResourcePackage) => user.role === 'researcher' || item.created_by === user.id;
  const visible = packages.filter((item) => category === 'all' || (category === 'unclassified' ? !item.category : item.category === category));
  const hasFile = (type:string) => editor !== null && editor !== 'new' && editor.assets.some((asset) => asset.asset_type === type);
  const save = async(submit:boolean,skipSupplements=false) => {
    if(!editor) return;
    const chosen = [files.plan,files.materials,files.booklet,...(skipSupplements ? [] : files.supplements)].filter((file):file is File => !!file);
    for(const file of chosen) if(file.size < 1 || file.size > 500*1024*1024) throw new Error(`${file.name}：请选择非空且不超过500MB的文件`);
    if(submit && (['plan','materials','booklet'] as const).some((type) => !files[type] && !hasFile(type))) throw new Error('提交前请补齐课程计划、课程材料和课程手册');
    let current = editor === 'new'
      ? {...(await remoteApi.createCurriculumResourcePackage({title:form.title,activityOrigin:form.activityOrigin,category:form.category,applicableGrades:form.grades,themes:splitLines(form.themes)})).item,assets:[]} : editor;
    setEditor(current);
    if(editor !== 'new') await remoteApi.updateCurriculumResourcePackage(current.id,{title:form.title,activityOrigin:form.activityOrigin,category:form.category,applicableGrades:form.grades,themes:splitLines(form.themes)});
    const selections:Array<{type:'plan'|'materials'|'booklet'|'supplement';file:File}> = (['plan','materials','booklet'] as const).flatMap((type) => files[type] ? [{type,file:files[type]!}] : []);
    if(!skipSupplements) selections.push(...files.supplements.map((file) => ({type:'supplement' as const,file})));
    for(const {type,file} of selections) {
      try {
        const result = await remoteApi.uploadCurriculumResourceAsset(current.id,type,file,(percent) => setProgress(`${file.name} · ${percent}%${percent === 100 ? ' · 正在保存' : ''}`));
        current = {...current,assets:[...current.assets.filter((asset) => type === 'supplement' || asset.asset_type !== type),result.item]};
        setEditor(current);
        setFiles((value) => type === 'supplement' ? {...value,supplements:value.supplements.filter((item) => item !== file)} : {...value,[type]:null});
      } catch(reason) {setSkipAvailable(type === 'supplement');await load();throw reason;}
    }
    if(submit) await remoteApi.submitCurriculumResourcePackage(current.id);
    setEditor(null);setProgress('');setSkipAvailable(false);await load();await onChange();
  };
  const submit = (event:FormEvent) => {event.preventDefault();void run(() => save(true));};
  const remove = (item:RemoteCurriculumResourcePackage) => {
    if(!window.confirm(`删除未完成资源“${item.title}”？该资源的已上传文件将一并清理。`)) return;
    void run(async() => {await remoteApi.deleteCurriculumResourcePackage(item.id);if(detail?.id === item.id) setDetail(null);await load();await onChange();});
  };
  const changeCategory = (item:RemoteCurriculumResourcePackage,value:string) => void run(async() => {
    await remoteApi.updateCurriculumResourcePackage(item.id,{category:value ? value as ResourceCategory : null});await load();setDetail(null);setAnalysisRefresh((current) => current+1);
  });
  const sources = (ids:string[]) => <div className="resource-analysis-sources">{ids.map((id) => {const item=packages.find((value) => value.id === id);return item ? <button key={id} onClick={() => setDetail(item)}>{item.title}</button> : <span key={id}>来源资料已变更</span>;})}</div>;

  return <section className="resource-library-section">
    <div className="resource-library-toolbar"><div><h2>游戏课程资源库</h2><p>按分类查找课程，在线阅读资料，主动分析分类的指向内容与指标侧重。</p></div><div className="page-action-row"><button className="btn btn-secondary" disabled={busy} onClick={() => void run(async() => {await load();setAnalysisRefresh((current) => current+1);})}><RefreshCcw/>刷新资源</button><button className="btn btn-primary" disabled={busy} onClick={() => openEditor('new')}><Upload/>上传课程资源包</button></div></div>
    {error && <p className="remote-error" role="alert">{error}</p>}
    <div className="resource-category-menu">{Object.entries(categories).map(([value,label]) => <button className={category === value ? 'selected' : ''} onClick={() => setCategory(value as ResourceCategory)} key={value}><BookOpen/><strong>{label}</strong><span>{packages.filter((item) => item.category === value).length}份课程资料</span></button>)}</div>
    <div className="resource-library-filter"><button className={category === 'all' ? 'selected' : ''} onClick={() => setCategory('all')}>全部课程</button><button className={category === 'unclassified' ? 'selected' : ''} onClick={() => setCategory('unclassified')}>待分类（{packages.filter((item) => !item.category).length}）</button></div>
    {category !== 'all' && category !== 'unclassified' && <Panel title={`${categories[category]} · 分类资料分析`} subtitle="点击后才调用AI，汇总该分类已入库课程；资料有变化时可重新分析。" action={<button className="btn btn-secondary" disabled={busy || !!analysis && ['queued','processing'].includes(analysis.status) || !packages.some((item) => item.category === category && item.status === 'active')} onClick={() => void run(async() => {const result=await remoteApi.analyzeResourceCategory(category);setAnalysis(result.item);setAnalysisRefresh((value) => value+1);})}><Sparkles/>{analysis?.status === 'completed' ? '重新分析' : '分析当前分类'}</button>}>
      {!analysis ? <p className="empty-inline">尚未分析。上传和分类资料不会自动调用AI。</p> : ['queued','processing'].includes(analysis.status) ? <p className="resource-analysis-progress">正在后台整理分类资料，可以离开页面，稍后返回查看。</p> : analysis.status === 'failed' ? <p className="remote-error" role="alert">{categoryErrorText(analysis.error_message)}</p> : analysis.result ? <div className="resource-category-result"><p className="resource-analysis-meta">{analysis.provider === 'ScenarioAIProvider' ? '模拟AI' : 'AI资料汇总'} · {new Date(analysis.completed_at || analysis.created_at).toLocaleString('zh-CN')}{analysis.isStale ? ' · 分类资料已变化，建议重新分析' : ''}</p><h3>指向内容</h3>{analysis.result.directionalContent.map((item,index) => <article key={index}><strong>{item.title}</strong><p>{item.description}</p>{sources(item.sourcePackageIds)}</article>)}<h3>指标侧重</h3>{analysis.result.indicatorFocus.map((item,index) => <article key={index}><strong>{item.name}</strong><p>{item.focus}</p><ul>{item.observableBehaviors.map((behavior) => <li key={behavior}>{behavior}</li>)}</ul>{sources(item.sourcePackageIds)}</article>)}{analysis.result.limitations.length > 0 && <details><summary>查看资料范围与分析提醒</summary>{analysis.result.limitations.map((item,index) => <p key={index}>{item}</p>)}</details>}</div> : null}
    </Panel>}
    <div className="resource-course-grid">{visible.length ? visible.map((item) => <article className="resource-course-card" key={item.id}><div><Badge tone={item.status === 'active' ? 'green' : 'orange'}>{statusLabels[item.status]}</Badge><span>{item.category ? categories[item.category] : '待分类'}</span></div><button className="resource-course-title" onClick={() => setDetail(item)}><h3>{item.title}</h3></button><p>{item.activity_origin || item.summary}</p><small>{item.applicable_grades.map((grade) => grades[grade]).join('、')} · {item.assets.length}份文件</small><footer><button className="btn btn-secondary" onClick={() => setDetail(item)}><Eye/>查看课程资料</button>{canManage(item) && ['draft','rejected'].includes(item.status) && <><button className="btn btn-secondary" onClick={() => openEditor(item)}>继续上传 / 编辑</button><button className="btn btn-ghost-danger" disabled={busy} onClick={() => remove(item)}><Trash2/>删除</button></>}</footer></article>) : <EmptyState title="该分类暂无课程资料" description="上传新资料或为已有资源调整分类。"/>}</div>
    {detail && <Modal wide title={detail.title} description={`${detail.category ? categories[detail.category] : '待分类'} · ${statusLabels[detail.status]}`} onClose={() => setDetail(null)}><div className="resource-course-detail"><h3>活动来源</h3><p>{detail.activity_origin || detail.summary}</p>{canManage(detail) && <label><span>课程分类</span><select value={detail.category || ''} disabled={busy} onChange={(event) => changeCategory(detail,event.target.value)}><option value="">待分类</option>{Object.entries(categories).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>}<h3>课程文件</h3>{detail.assets.map((asset) => <div className="resource-file-row" key={asset.id}><div><strong>{fileLabels[asset.asset_type]}</strong><span>{asset.file_name}</span><small>{(asset.size_bytes/1024/1024).toFixed(1)} MB</small></div><button className="btn btn-secondary" disabled={busy} onClick={() => void run(async() => setPreview(await remoteApi.previewCurriculumResourceAsset(asset.id)))}><Eye/>在线查阅</button><button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => remoteApi.downloadCurriculumResourceAsset(asset.id,asset.file_name))}><Download/>下载</button></div>)}{detail.review_comment && <p>教研意见：{detail.review_comment}</p>}{user.role === 'researcher' && detail.status === 'pending' && <div className="page-action-row"><button className="btn btn-primary" disabled={busy} onClick={() => void run(async() => {await remoteApi.reviewCurriculumResourcePackage(detail.id,{decision:'active',comment:'教研审核通过'});setDetail(null);await load();await onChange();})}>纳入经验库</button><button className="btn btn-secondary" disabled={busy} onClick={() => {const comment=window.prompt('填写退回修改说明');if(comment?.trim()) void run(async() => {await remoteApi.reviewCurriculumResourcePackage(detail.id,{decision:'rejected',comment});setDetail(null);await load();});}}>退回修改</button></div>}</div></Modal>}
    {preview && <Modal wide title={preview.fileName} description={preview.kind === 'text' ? 'Word文本阅读版，原文件可在课程资料中下载。' : '在线查阅课程资料'} onClose={() => setPreview(null)}>{preview.kind === 'pdf' ? <iframe title={preview.fileName} className="resource-preview-frame" src={preview.url}/> : preview.kind === 'image' ? <img className="resource-preview-image" src={preview.url} alt={preview.fileName}/> : <div className="resource-preview-text">{preview.note && <p>{preview.note}</p>}<pre>{preview.text || '未提取到文字，请下载原文件查看。'}</pre></div>}</Modal>}
    {editor && <Modal wide title={editor === 'new' ? '上传课程资源包' : '继续上传和编辑资源包'} description="单文件最高500MB。上传失败时成功的文件会保留，可继续提交同一份草稿。" onClose={() => {if(!busy) setEditor(null);}}><form className="remote-form resource-upload-form" onSubmit={submit}>
      {error && <p className="remote-error full-field" role="alert">{error}</p>}
      <label><span>资源包名称</span><input required minLength={2} maxLength={160} value={form.title} onChange={(event) => setForm({...form,title:event.target.value})}/></label><label><span>课程分类</span><select value={form.category} onChange={(event) => setForm({...form,category:event.target.value as ResourceCategory})}>{Object.entries(categories).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="full-field"><span>活动来源</span><textarea required minLength={2} maxLength={3000} rows={4} value={form.activityOrigin} onChange={(event) => setForm({...form,activityOrigin:event.target.value})} placeholder="记录幼儿的兴趣、真实问题、观察事件或生活情境。"/></label>
      <fieldset className="full-field"><legend>适用年龄段</legend>{Object.entries(grades).map(([value,label]) => <label key={value}><input type="checkbox" checked={form.grades.includes(value as GradeCode)} onChange={() => setForm({...form,grades:form.grades.includes(value as GradeCode) ? form.grades.filter((grade) => grade !== value) : [...form.grades,value as GradeCode]})}/>{label}</label>)}</fieldset><label className="full-field"><span>相关游戏主题</span><input value={form.themes} onChange={(event) => setForm({...form,themes:event.target.value})}/></label>
      {(['plan','materials','booklet'] as const).map((type) => <label key={type}><span>{fileLabels[type]}（{type === 'plan' ? 'DOC / DOCX' : 'PDF'}）</span>{hasFile(type) && <small>已上传，可直接保留；选择新文件可替换。</small>}<input type="file" accept={type === 'plan' ? '.doc,.docx' : '.pdf'} onChange={(event) => setFiles({...files,[type]:event.target.files?.[0] || null})}/></label>)}<label><span>补充资料（可选，最多5个）</span><input type="file" multiple accept=".doc,.docx,.pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles({...files,supplements:Array.from(event.target.files || []).slice(0,5)})}/></label>
      {progress && <p className="full-field resource-upload-progress" role="status">{progress}</p>}
      <div className="full-field page-action-row"><button className="btn btn-secondary" type="button" disabled={busy || !form.title.trim() || form.activityOrigin.trim().length < 2 || !form.grades.length} onClick={() => void run(() => save(false))}>保存草稿</button><button className="btn btn-primary" disabled={busy || !form.grades.length} type="submit"><Upload/>{busy ? '正在上传，请等待' : '上传并提交'}</button>{skipAvailable && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(() => save(true,true))}>补充资料稍后上传，先提交课程</button>}</div>
    </form></Modal>}
  </section>;
}
