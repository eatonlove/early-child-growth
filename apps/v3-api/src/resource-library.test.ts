import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { describe,expect,it } from 'vitest';
import { Document,Packer,Paragraph } from 'docx';
import { boundedUploadStream,extractResourceText,resourceFileLimit } from './resource-library.js';
import { QianwenAIProvider } from './ai/qianwen-provider.js';

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
});
