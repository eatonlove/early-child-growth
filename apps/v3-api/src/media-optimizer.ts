import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const plan = mediaOptimizationPlan(mimeType);
  if (!plan) return {
    body,
    mimeType,
    status: "not_applicable",
    mode: "none",
    tool: "none",
    originalSizeBytes: body.length,
    optimizedSizeBytes: body.length,
  };

  const directory = await mkdtemp(join(tmpdir(), "tongji-media-"));
  const input = join(directory, `input.${plan.inputExtension}`);
  const output = join(directory, `output.${plan.outputExtension}`);
  try {
    await writeFile(input, body);
    await runner(plan.command, plan.args(input, output));
    const candidate = await readFile(output);
    if (!candidate.length) throw new Error("媒体优化工具生成了空文件");
    const optimized = candidate.length < body.length ? candidate : body;
    return {
      body: optimized,
      mimeType,
      status: "optimized",
      mode: "lossless",
      tool: candidate.length < body.length ? plan.tool : `${plan.tool}; kept-original-smaller`,
      originalSizeBytes: body.length,
      optimizedSizeBytes: optimized.length,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
