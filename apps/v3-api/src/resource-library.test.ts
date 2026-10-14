import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { describe,expect,it } from 'vitest';
import { Document,Packer,Paragraph } from 'docx';
import { boundedUploadStream,extractResourceText,resourceFileLimit } from './resource-library.js';
import { QianwenAIProvider } from './ai/qianwen-provider.js';
import type {ResourceCategoryAnalysis,ResourceCategoryAnalysisInput} from './ai/contracts.js';

const packageId='11111111-1111-4111-8111-111111111111';
const categoryInput:ResourceCategoryAnalysisInput={category:'growth',categoryLabel:'悦生长',
  resources:[{packageId,title:'合作搭桥',activityOrigin:'课程关注搭桥中的合作和材料比较',text:'提供长板和支撑块，观察幼儿如何协商分工。',notes:[]}],
  prompt:{key:'resource_category_analysis',systemPrompt:'园所自定义分类提示词',version:'custom.r2',source:'custom',revision:2,model:'selected-model'}};
const categoryResult:ResourceCategoryAnalysis={
  directionalContent:[{title:'合作与材料探究',description:'课程关注建构中的分工与支撑位置比较。',sourcePackageIds:[packageId]}],
  indicatorFocus:[{name:'合作协商',focus:'关注幼儿如何表达分工意图。',observableBehaviors:['后续观察如何协商支撑块的选择。'],sourcePackageIds:[packageId]}],
  limitations:['单份课程资料不能用于评定幼儿发展水平。'],
};

function categoryProvider(results:ResourceCategoryAnalysis[]){
  const requests:any[]=[];
  const fetcher:typeof fetch=async(_url,init)=>{
    requests.push(JSON.parse(String(init?.body)));
    const result=results[requests.length-1];
    if(!result)throw new Error('额外的模型调用不应发生');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200});
  };
  return {provider:new QianwenAIProvider({apiKey:'sk-test-valid-key',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',textModel:'qwen-test',visionModel:'qwen-test',timeoutMs:5000},fetcher),requests};
}

describe('resource upload and category analysis',() => {
  it('enforces both the declared stream length and actual byte limit',async() => {
    expect(resourceFileLimit).toBe(524288000);
    await expect(buffer(boundedUploadStream(Readable.from([Buffer.alloc(4),Buffer.alloc(4)]),8,8))).resolves.toHaveLength(8);
    await expect(buffer(boundedUploadStream(Readable.from([Buffer.alloc(9)]),9,8))).rejects.toThrow('上限');
    await expect(buffer(boundedUploadStream(Readable.from([Buffer.alloc(4)]),8,8))).rejects.toThrow('不完整');
  });

  it('reads DOCX text from a stream and preserves Chinese paragraphs and XML entities',async() => {
    const doc = new Document({sections:[{children:[new Paragraph('懂生活：幼儿比较瓶子与材料。'),new Paragraph('A & B < C')]}]});
    const body = await Packer.toBuffer(doc);
    const result = await extractResourceText(Readable.from([body]),'application/vnd.openxmlformats-officedocument.wordprocessingml.document','课程.docx',body.length);
    expect(result.text).toContain('懂生活：幼儿比较瓶子与材料。');
    expect(result.text).toContain('A & B < C');
  });

  it('uses the tenant prompt and model and rejects invented resource citations',async() => {
    const id='11111111-1111-4111-8111-111111111111';
    let requestBody:any;
    const fetcher:typeof fetch = async(_input,init) => {
      requestBody=JSON.parse(String(init?.body));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({directionalContent:[{title:'材料探究',description:'比较材料的使用方式。',sourcePackageIds:['22222222-2222-4222-8222-222222222222']}],indicatorFocus:[{name:'比较策略',focus:'关注调整依据',observableBehaviors:['记录材料替换的理由'],sourcePackageIds:[id]}],limitations:[]})}}]}),{status:200});
    };
    const provider=new QianwenAIProvider({apiKey:'sk-test-valid-key',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',textModel:'qwen-test',visionModel:'qwen-test',timeoutMs:5000},fetcher);
    await expect(provider.analyzeResourceCategory({category:'creation',categoryLabel:'慧创生',resources:[{packageId:id,title:'小瓶子',activityOrigin:'幼儿提出瓶子能做什么',text:'比较不同材料',notes:[]}],prompt:{key:'resource_category_analysis',systemPrompt:'园所自定义课程分类提示词',version:'custom.r1',source:'custom',revision:1,model:'qwen-selected'}})).rejects.toThrow('未提供');
    expect(requestBody.model).toBe('qwen-selected');
    expect(requestBody.messages[0].content).toContain('园所自定义课程分类提示词');
    expect(JSON.parse(requestBody.messages[1].content).categoryLabel).toBe('慧创生');
  });

  it('returns a safe course summary without an extra model call',async()=>{
    const {provider,requests}=categoryProvider([categoryResult]);
    const generated=await provider.analyzeResourceCategory(categoryInput);
    expect(generated.data).toEqual(categoryResult);expect(requests).toHaveLength(1);
    expect(generated.model).toBe('selected-model');expect(generated.promptVersion).toBe('custom.r2');
    expect(requests[0].messages[0].content).toContain('园所自定义分类提示词');
  });

  it('regenerates a tagged category draft once and revalidates the replacement',async()=>{
    const unsafe={...categoryResult,directionalContent:[{...categoryResult.directionalContent[0]!,description:'该幼儿的合作经验落后于同龄幼儿。'}]};
    const {provider,requests}=categoryProvider([unsafe,categoryResult]);
    const generated=await provider.analyzeResourceCategory(categoryInput);
    expect(generated.data).toEqual(categoryResult);expect(requests).toHaveLength(2);
    expect(generated.notice).toContain('自动修订');
    expect(requests[1].model).toBe('selected-model');
    const correction=requests[1].messages.at(-1).content;
    expect(correction).toContain('只提炼课程关注');expect(correction).not.toContain('落后');
    expect(JSON.stringify(requests[1].messages)).not.toContain(unsafe.directionalContent[0]!.description);
  });

  it('rejects repeatedly unsafe output with a teacher-readable error instead of deleting the guard',async()=>{
    const unsafe={...categoryResult,limitations:['该幼儿的合作能力落后。']};
    const {provider,requests}=categoryProvider([unsafe,unsafe]);
    await expect(provider.analyzeResourceCategory(categoryInput)).rejects.toThrow('自动修订后仍未通过校验');
    expect(requests).toHaveLength(2);
  });

  it('rejects invented resource references in the regenerated draft',async()=>{
    const unsafe={...categoryResult,indicatorFocus:[{...categoryResult.indicatorFocus[0]!,focus:'该幼儿的表现落后。'}]};
    const fabricated={...categoryResult,directionalContent:[{...categoryResult.directionalContent[0]!,sourcePackageIds:['22222222-2222-4222-8222-222222222222']}]};
    const {provider,requests}=categoryProvider([unsafe,fabricated]);
    await expect(provider.analyzeResourceCategory(categoryInput)).rejects.toThrow('未提供的课程资料');
    expect(requests).toHaveLength(2);
  });

  it('keeps genuine boundary-language cautions without invoking correction',async()=>{
    const safe={...categoryResult,limitations:['课程资料不能用于判断幼儿是否落后于同龄儿童。']};
    const {provider,requests}=categoryProvider([safe]);
    await expect(provider.analyzeResourceCategory(categoryInput)).resolves.toMatchObject({data:safe});
    expect(requests).toHaveLength(1);
  });
});
