import { Readable, Transform } from 'node:stream';
import { SaxesParser } from 'saxes';
import { Parse } from 'unzipper';
import { z } from 'zod';
import { extractDocumentText } from './documents.js';

export const resourceFileLimit = 500 * 1024 * 1024;
export const resourceCategorySchema = z.enum(['life', 'creation', 'growth']);
export const resourceCategoryLabels = { life: '懂生活', creation: '慧创生', growth: '悦生长' } as const;
export type ResourceCategory = z.infer<typeof resourceCategorySchema>;

export function boundedUploadStream(source: Readable, expectedBytes: number, limit = resourceFileLimit) {
  let received = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > limit || received > expectedBytes) callback(new Error('上传文件超过登记大小或500MB上限'));
      else callback(null, chunk);
    },
    flush(callback) {
      callback(received === expectedBytes ? null : new Error('上传文件不完整，请重试'));
    },
  });
  source.on('error', (error) => guard.destroy(error));
  return source.pipe(guard);
}

export async function extractResourceText(source: Readable, mimeType: string, fileName: string, sizeBytes: number) {
  if (fileName.toLowerCase().endsWith('.docx')) {
    const archive = source.pipe(Parse({ forceStream: true }));
    source.on('error', (error) => archive.destroy(error));
    let text = '';
    try {
      for await (const entry of archive) {
        if (entry.path !== 'word/document.xml') { entry.autodrain(); continue; }
        const parser = new SaxesParser({ xmlns: false });
        let insideText = false;
        parser.on('opentag', (node) => { insideText = node.name === 'w:t'; if (node.name === 'w:tab') text += ' '; });
        parser.on('text', (value) => { if (insideText) text += value; });
        parser.on('closetag', (node) => { if (node.name === 'w:t') insideText = false; if (node.name === 'w:p') text += '\n'; });
        const decoder = new TextDecoder();
        let xmlBytes = 0;
        for await (const chunk of entry) {
          xmlBytes += chunk.length;
          if (xmlBytes > 16 * 1024 * 1024) throw new Error('Word正文较长，请拆分课程正文后再分析');
          parser.write(decoder.decode(chunk, { stream: true }));
        }
        parser.write(decoder.decode()).close();
        return { text: text.trim().slice(0, 50000), note: text.length > 50000 ? '正文较长，本次提取前50000字。' : '' };
      }
      return { text: '', note: 'Word文件没有可提取正文。' };
    } finally { source.destroy(); archive.destroy(); }
  }
  if (mimeType.startsWith('image/')) { source.destroy(); return { text: '', note: '图片可在线查看，本次分类汇总不识别图片文字。' }; }
  if (sizeBytes > 32 * 1024 * 1024) {
    source.destroy();
    return { text: '', note: '较大的PDF或旧版DOC可在线查看或下载；请补充DOCX文字资料用于分类分析。' };
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of source) {
    received += chunk.length;
    if (received > 32 * 1024 * 1024) { source.destroy(); throw new Error('文本解析文件大小超限'); }
    chunks.push(Buffer.from(chunk));
  }
  const text = await extractDocumentText(Buffer.concat(chunks), mimeType, fileName);
  return { text, note: text ? '' : '文件未提取到可用文字，请补充文字版资料。' };
}
