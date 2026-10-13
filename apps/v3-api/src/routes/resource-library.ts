import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAIProvider } from '../ai/provider.js';
import { resolveTenantPrompt } from '../ai/prompt-config.js';
import { enqueueAnalysisTask } from '../analysis-task-queue.js';
import { config } from '../config.js';
import { ApiError, audit, authenticate } from '../http.js';
import { extractResourceText, resourceCategoryLabels, resourceCategorySchema } from '../resource-library.js';
import { mediaStorage } from '../runtime/media-storage.js';
import { serviceClient } from '../supabase.js';

const uuid = z.string().uuid();
const fingerprint = (items: Array<{id:string;updated_at:string}>) => createHash('sha256').update(JSON.stringify(items.map((item) => [item.id,item.updated_at]).sort())).digest('hex');
const aiProvider = createAIProvider({mode:config.AI_MODE,apiKey:config.qwenApiKey,baseUrl:config.QWEN_BASE_URL,textModel:config.QWEN_TEXT_MODEL,visionModel:config.QWEN_VISION_MODEL,timeoutMs:config.QWEN_TIMEOUT_MS,visionTimeoutMs:config.QWEN_VISION_TIMEOUT_MS,webSearchEnabled:false,fallbackToSimulated:config.aiFallbackToSimulated});

export async function readResourceAssetText(asset: any) {
  if (asset.extracted_text !== null && asset.extracted_text !== undefined) return { text:asset.extracted_text as string, note:asset.extraction_note || '' };
  const source = await mediaStorage.openReadStream(asset.storage_path);
  const extracted = await extractResourceText(source, asset.mime_type, asset.file_name, Number(asset.size_bytes));
  const { error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from('curriculum_resource_assets')
    .update({extracted_text:extracted.text,extraction_note:extracted.note}).eq('id',asset.id).eq('tenant_id',asset.tenant_id).eq('storage_path',asset.storage_path);
  if (error) throw new Error('课程资源解析结果保存失败');
  return extracted;
}

export async function markInterruptedResourceAnalyses() {
  const { error } = await serviceClient.schema(config.SUPABASE_SCHEMA).from('resource_category_analyses')
    .update({status:'failed',error_message:'分析服务重启，请点击重新分析',completed_at:new Date().toISOString()}).in('status',['queued','processing']);
  return error;
}

export async function resourceLibraryRoutes(app: FastifyInstance) {
  app.patch('/api/curriculum-resource-packages/:id', async (request) => {
    const auth = await authenticate(request);
    const {id} = z.object({id:uuid}).parse(request.params);
    const input = z.object({category:resourceCategorySchema.nullable().optional(),title:z.string().trim().min(2).max(160).optional(),activityOrigin:z.string().trim().min(2).max(3000).optional(),applicableGrades:z.array(z.enum(['small','middle','large'])).min(1).max(3).optional(),themes:z.array(z.string().trim().min(1).max(80)).max(20).optional()}).parse(request.body);
    const {data:current,error:readError} = await auth.data.from('curriculum_resource_packages').select('*').eq('id',id).maybeSingle();
    if(readError) throw new ApiError(500,'RESOURCE_READ_FAILED','课程资源读取失败');
    if(!current || (auth.role !== 'researcher' && current.created_by !== auth.userId)) throw new ApiError(404,'RESOURCE_NOT_FOUND','资源包不存在或无权修改');
    if(!['draft','rejected'].includes(current.status) && Object.keys(input).some((key) => key !== 'category')) throw new ApiError(409,'RESOURCE_ALREADY_SUBMITTED','已提交资料可以调整分类；正文信息请在草稿或退回状态下修改');
    const {data,error} = await serviceClient.schema(config.SUPABASE_SCHEMA).from('curriculum_resource_packages').update({
      ...(input.category !== undefined && {category:input.category}),...(input.title !== undefined && {title:input.title}),
      ...(input.activityOrigin !== undefined && {activity_origin:input.activityOrigin,summary:input.activityOrigin}),
      ...(input.applicableGrades && {applicable_grades:input.applicableGrades}),...(input.themes && {themes:input.themes}),
    }).eq('id',id).eq('tenant_id',auth.tenantId).select().single();
    if(error) throw new ApiError(500,'RESOURCE_UPDATE_FAILED','课程资源修改失败');
    await audit(auth,'curriculum_resource.updated','curriculum_resource_package',id,{category:data.category});
    return {item:data};
  });

  app.delete('/api/curriculum-resource-packages/:id', async (request,reply) => {
    const auth = await authenticate(request);
    const {id} = z.object({id:uuid}).parse(request.params);
    const {data:current,error:readError} = await auth.data.from('curriculum_resource_packages').select('*').eq('id',id).maybeSingle();
    if(readError) throw new ApiError(500,'RESOURCE_READ_FAILED','资源包读取失败');
    if(!current || (auth.role !== 'researcher' && current.created_by !== auth.userId)) throw new ApiError(404,'RESOURCE_NOT_FOUND','资源包不存在或无权删除');
    if(!['draft','rejected'].includes(current.status)) throw new ApiError(409,'RESOURCE_DELETE_STATE_INVALID','仅未完成或退回的资源包可删除');
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const {data:assets,error:assetError} = await schema.from('curriculum_resource_assets').select('storage_path').eq('package_id',id).eq('tenant_id',auth.tenantId);
    if(assetError) throw new ApiError(500,'RESOURCE_DELETE_FAILED','资源文件目录读取失败');
    // Delete conditionally before touching files: a concurrent submission must retain its evidence.
    const {data:deleted,error} = await schema.from('curriculum_resource_packages').delete().eq('id',id).eq('tenant_id',auth.tenantId).in('status',['draft','rejected']).select('id');
    if(error) throw new ApiError(500,'RESOURCE_DELETE_FAILED','资源包删除失败');
    if(!deleted?.length) throw new ApiError(409,'RESOURCE_DELETE_STATE_INVALID','资料状态已变化，请刷新后再操作');
    const {error:memoryError} = await schema.from('professional_memories').delete().eq('tenant_id',auth.tenantId).eq('source_resource_type','curriculum_resource_package').eq('source_resource_id',id);
    const cleanupPaths:string[] = [];
    for(const asset of assets ?? []) {
      const {error:cleanupError} = await mediaStorage.remove(asset.storage_path);
      if(cleanupError) cleanupPaths.push(asset.storage_path);
    }
    if(memoryError || cleanupPaths.length) request.log.error({packageId:id,memoryError,cleanupPaths},'deleted resource requires storage/index cleanup');
    await audit(auth,'curriculum_resource.deleted','curriculum_resource_package',id,{title:current.title,assetCount:assets?.length || 0,cleanupPaths,indexCleanupPending:!!memoryError});
    return reply.status(204).send();
  });

  app.get('/api/curriculum-resource-assets/:id/preview', async(request) => {
    const auth = await authenticate(request);
    const {id} = z.object({id:uuid}).parse(request.params);
    const {data:asset,error} = await auth.data.from('curriculum_resource_assets').select('*').eq('id',id).maybeSingle();
    if(error) throw new ApiError(500,'RESOURCE_PREVIEW_FAILED','资源文件读取失败');
    if(!asset) throw new ApiError(404,'RESOURCE_NOT_FOUND','资源文件不存在或无权查看');
    if(asset.mime_type === 'application/pdf' || asset.mime_type.startsWith('image/')) {
      const {data:signed,error:signError} = await mediaStorage.createSignedUrl(asset.storage_path,900);
      if(signError || !signed) throw new ApiError(503,'RESOURCE_PREVIEW_FAILED','预览链接暂时不可用');
      return {kind:asset.mime_type === 'application/pdf' ? 'pdf' : 'image',url:signed.signedUrl,fileName:asset.file_name};
    }
    try { const result = await readResourceAssetText(asset); return {kind:'text',fileName:asset.file_name,...result}; }
    catch(reason) { request.log.warn({err:reason,assetId:id},'resource preview extraction failed'); throw new ApiError(503,'RESOURCE_PREVIEW_FAILED','Word正文暂时无法解析，请下载原文件或稍后重试'); }
  });

  app.get('/api/resource-categories/:category/analysis', async(request) => {
    const auth = await authenticate(request);
    const {category} = z.object({category:resourceCategorySchema}).parse(request.params);
    const [{data:items,error},{data:resources,error:resourceError}] = await Promise.all([
      auth.data.from('resource_category_analyses').select('*').eq('category',category).order('created_at',{ascending:false}).limit(1),
      auth.data.from('curriculum_resource_packages').select('id,updated_at').eq('category',category).eq('status','active'),
    ]);
    if(error || resourceError) throw new ApiError(500,'CATEGORY_ANALYSIS_READ_FAILED','分类分析读取失败');
    const item = items?.[0] ?? null;
    return {item:item ? {...item,isStale:item.source_fingerprint !== fingerprint(resources ?? [])} : null};
  });

  app.post('/api/resource-categories/:category/analyze',{config:{rateLimit:{max:10,timeWindow:'1 hour'}}},async(request,reply) => {
    const auth = await authenticate(request);
    const {category} = z.object({category:resourceCategorySchema}).parse(request.params);
    const {data:resources,error} = await auth.data.from('curriculum_resource_packages').select('*').eq('category',category).eq('status','active').order('created_at');
    if(error) throw new ApiError(500,'CATEGORY_RESOURCE_READ_FAILED','分类课程资料读取失败');
    if(!resources?.length) throw new ApiError(409,'CATEGORY_RESOURCE_REQUIRED','请先为该分类添加已入库课程资料');
    if(resources.length > 100) throw new ApiError(409,'CATEGORY_RESOURCE_LIMIT','该分类超过100份资料，请先整理分类后分析');
    const schema = serviceClient.schema(config.SUPABASE_SCHEMA);
    const prompt = await resolveTenantPrompt(auth.tenantId,'resource_category_analysis');
    const {data:job,error:jobError} = await schema.from('resource_category_analyses').insert({tenant_id:auth.tenantId,category,source_package_ids:resources.map((item) => item.id),source_fingerprint:fingerprint(resources),created_by:auth.userId,model:prompt.model,prompt_version:prompt.version}).select().single();
    if(jobError) throw new ApiError(jobError.code === '23505' ? 409 : 500,'CATEGORY_ANALYSIS_START_FAILED',jobError.code === '23505' ? '该分类正在分析，请等待完成' : '分类分析暂时无法启动');
    await audit(auth,'resource_category.analysis_requested','resource_category_analysis',job.id,{category,resourceCount:resources.length,promptVersion:prompt.version});
    reply.status(202).send({item:job});
    enqueueAnalysisTask(async() => {
      const update = async(values:Record<string,unknown>) => {
        const {error} = await schema.from('resource_category_analyses').update(values).eq('id',job.id).eq('tenant_id',auth.tenantId);
        if(error) throw new Error('分类分析状态保存失败');
      };
      try {
        await update({status:'processing'});
        const inputs = [];
        const perPackageBudget = Math.floor(80000/resources.length);
        for(const item of resources) {
          const {data:assets,error:assetError} = await schema.from('curriculum_resource_assets').select('*').eq('package_id',item.id).eq('tenant_id',auth.tenantId).order('created_at');
          if(assetError) throw new Error('课程资料目录读取失败');
          const parts:string[] = []; const notes:string[] = [];
          for(const asset of assets ?? []) {
            try { const extracted = await readResourceAssetText(asset); if(extracted.text) parts.push(`${asset.file_name}\n${extracted.text}`); if(extracted.note) notes.push(`${asset.file_name}：${extracted.note}`); }
            catch { notes.push(`${asset.file_name}：本次文字提取失败。`); }
          }
          const text = parts.join('\n\n');
          if(text.length > perPackageBudget) notes.push('该课程正文较长，本次采用节选；完整文件可在线阅读。');
          inputs.push({packageId:item.id,title:item.title,activityOrigin:item.activity_origin || item.summary,text:text.slice(0,perPackageBudget),notes});
        }
        if(inputs.every((item) => !item.text.trim())) throw new Error('当前分类未提取到课程正文，请补充可解析的Word或PDF文字资料');
        const generated = await aiProvider.analyzeResourceCategory({category,categoryLabel:resourceCategoryLabels[category],resources:inputs,prompt});
        const limitations = [...new Set([...generated.data.limitations,...inputs.flatMap((item) => item.notes)])];
        await update({status:'completed',result:{...generated.data,limitations},provider:generated.provider,model:generated.model,prompt_version:generated.promptVersion,completed_at:new Date().toISOString()});
      } catch(reason) {
        request.log.error({err:reason,analysisId:job.id},'resource category analysis failed');
        await update({status:'failed',error_message:reason instanceof Error ? reason.message.slice(0,500) : '分类分析失败，请重试',completed_at:new Date().toISOString()});
      }
    });
  });
}
