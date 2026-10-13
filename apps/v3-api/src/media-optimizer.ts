import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MediaOptimizationStatus = "optimized" | "not_applicable";

export interface MediaOptimizationResult {
  body: Buffer;
  mimeType: string;
  status: MediaOptimizationStatus;
  mode: "lossless" | "none";
  tool: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
}
export type MediaFileOptimizationResult=Omit<MediaOptimizationResult,'body'>&{path:string};

interface OptimizationPlan {
  command: string;
  inputExtension: string;
  outputExtension: string;
  args: (input: string, output: string) => string[];
  tool: string;
}

export type MediaCommandRunner = (command: string, args: string[]) => Promise<void>;

const defaultRunner: MediaCommandRunner = async (command, args) => {
  await execFileAsync(command, args, { timeout: 120_000, maxBuffer: 256 * 1024 });
};

export function mediaOptimizationPlan(mimeType: string): OptimizationPlan | null {
  if (mimeType === "image/jpeg") return {
    command: "jpegtran", inputExtension: "jpg", outputExtension: "jpg", tool: "jpegtran optimize/progressive",
    args: (input, output) => ["-copy", "all", "-optimize", "-progressive", "-outfile", output, input],
  };
  if (mimeType === "image/png") return {
    command: "optipng", inputExtension: "png", outputExtension: "png", tool: "optipng o2",
    args: (input, output) => ["-quiet", "-o2", "-out", output, input],
  };
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    const extension = mimeType === "video/mp4" ? "mp4" : "mov";
    return {
      command: "ffmpeg", inputExtension: extension, outputExtension: extension, tool: "ffmpeg stream-copy remux",
      args: (input, output) => [
        "-hide_banner", "-loglevel", "error", "-y", "-i", input,
        "-map", "0", "-map_metadata", "-1", "-c", "copy", "-movflags", "+faststart", output,
      ],
    };
  }
  return null;
}

export async function optimizeMediaLosslessly(
  body: Buffer,
  mimeType: string,
  runner: MediaCommandRunner = defaultRunner,
): Promise<MediaOptimizationResult> {
  const directory = await mkdtemp(join(tmpdir(), "tongji-media-"));
  const plan=mediaOptimizationPlan(mimeType);
  const input = join(directory, `input.${plan?.inputExtension||'bin'}`);
  const output = join(directory, `output.${plan?.outputExtension||'bin'}`);
  try {
    await writeFile(input, body);
    const result=await optimizeMediaFileLosslessly(input,mimeType,output,runner);
    const {path,...metadata}=result;
    return {...metadata,body:path===input?body:await readFile(path)};
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function optimizeMediaFileLosslessly(input:string,mimeType:string,output:string,runner:MediaCommandRunner=defaultRunner):Promise<MediaFileOptimizationResult> {
  const originalSizeBytes=(await stat(input)).size;
  if(!originalSizeBytes)throw new Error('媒体文件为空');
  const original={path:input,mimeType,originalSizeBytes,optimizedSizeBytes:originalSizeBytes};
  const plan=mediaOptimizationPlan(mimeType);
  if(!plan)return {...original,status:'not_applicable',mode:'none',tool:'none'};
  try{
    await runner(plan.command,plan.args(input,output));
    const size=(await stat(output)).size;
    if(!size)throw new Error('媒体优化工具生成了空文件');
    return {...original,path:size<originalSizeBytes?output:input,optimizedSizeBytes:Math.min(size,originalSizeBytes),status:'optimized',mode:'lossless',tool:size<originalSizeBytes?plan.tool:`${plan.tool}; kept-original-smaller`};
  }catch(reason){
    if(!mimeType.startsWith('video/'))throw reason;
    // Some phone videos carry data tracks MP4 remuxing cannot preserve. Validate
    // their playable tracks, then keep every byte of the original rather than drop tracks.
    await runner('ffmpeg',['-hide_banner','-loglevel','error','-i',input,'-map','0:v:0','-map','0:a?','-c','copy','-f','null','-']);
    return {...original,status:'not_applicable',mode:'none',tool:'ffmpeg playable-stream validation; kept-original-remux-incompatible'};
  }
}
