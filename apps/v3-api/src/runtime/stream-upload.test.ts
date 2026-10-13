import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { expect,it } from 'vitest';
import { postStream } from './stream-upload.js';

it('streams bytes with backpressure and preserves storage rejection responses',async() => {
  const server=createServer(async(request,response) => {
    if(request.url === '/reject') {response.writeHead(413);response.end('{"message":"too large"}');return;}
    let bytes=0;
    for await(const chunk of request) bytes+=chunk.length;
    response.writeHead(201);response.end(JSON.stringify({bytes}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=(server.address() as {port:number}).port;
  try {
    const size=4*1024*1024;
    const uploaded=await postStream(new URL(`http://127.0.0.1:${port}/ok`),Readable.from(Array.from({length:64},()=>Buffer.alloc(65536))),{'Content-Length':String(size)});
    expect(uploaded.statusCode).toBe(201);expect(JSON.parse(uploaded.body).bytes).toBe(size);
    const rejected=await postStream(new URL(`http://127.0.0.1:${port}/reject`),Readable.from([Buffer.alloc(65536)]),{'Content-Length':'65536'});
    expect(rejected.statusCode).toBe(413);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
