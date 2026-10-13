import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function postStream(url:URL, body:Readable, headers:Record<string,string>) {
  const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url,{method:'POST',headers});
  const response = new Promise<{statusCode:number;body:string}>((resolve,reject) => {
    request.once('error',reject);
    request.once('response',incoming => {
      const chunks:Buffer[] = [];let size=0;
      incoming.on('data',(chunk:Buffer) => {
        size += chunk.length;
        if(size > 64*1024) {request.destroy(new Error('上传响应过大'));incoming.destroy();}
        else chunks.push(chunk);
      });
      incoming.once('error',reject);
      incoming.once('end',() => {
        resolve({statusCode:incoming.statusCode || 500,body:Buffer.concat(chunks).toString('utf8')});
        if((incoming.statusCode || 500) >= 400) request.destroy();
      });
    });
  });
  request.setTimeout(30*60*1000,() => request.destroy(new Error('文件上传超时，请重试')));
  const transfer = pipeline(body,request);
  const [result,uploaded] = await Promise.allSettled([response,transfer]);
  if(result.status === 'rejected') throw result.reason;
  if(uploaded.status === 'rejected' && result.value.statusCode < 400) throw uploaded.reason;
  return result.value;
}
