import { copyFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { mediaOptimizationPlan, optimizeMediaLosslessly } from "./media-optimizer.js";

describe("media optimizer", () => {
  it("uses stream copy for videos so frames and audio are never re-encoded", () => {
    const plan = mediaOptimizationPlan("video/mp4");
    expect(plan?.command).toBe("ffmpeg");
    expect(plan?.args("in.mp4", "out.mp4")).toEqual(expect.arrayContaining(["-c", "copy", "-map_metadata", "-1"]));
  });

  it("uses coefficient-preserving or lossless image tools", () => {
    expect(mediaOptimizationPlan("image/jpeg")?.command).toBe("jpegtran");
    expect(mediaOptimizationPlan("image/png")?.command).toBe("optipng");
    expect(mediaOptimizationPlan("image/webp")).toBeNull();
  });

  it("stores the optimized output and reports both sizes", async () => {
    const source = Buffer.from("original-media");
    const runner = vi.fn(async (_command: string, args: string[]) => {
      const input = args.at(-1)!;
      const output = args[args.indexOf("-outfile") + 1]!;
      await copyFile(input, output);
    });
    const result = await optimizeMediaLosslessly(source, "image/jpeg", runner);
    expect(result.status).toBe("optimized");
    expect(result.body.equals(source)).toBe(true);
    expect(result.originalSizeBytes).toBe(source.length);
    expect(result.optimizedSizeBytes).toBe(source.length);
  });

  it("leaves documents unchanged and marks optimization not applicable", async () => {
    const source = Buffer.from("pdf");
    const result = await optimizeMediaLosslessly(source, "application/pdf");
    expect(result.status).toBe("not_applicable");
    expect(result.body).toBe(source);
  });
  it('keeps original phone-video bytes when auxiliary tracks cannot be remuxed',async()=>{
    const source=Buffer.from('video-with-phone-data-track');
    const runner=vi.fn(async(_command:string,args:string[])=>{
      if(args.includes('+faststart'))throw new Error('Could not find tag for codec none in stream #2');
      expect(args).toEqual(expect.arrayContaining(['0:v:0','0:a?','copy','null']));
    });
    const result=await optimizeMediaLosslessly(source,'video/mp4',runner);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({body:source,status:'not_applicable',mode:'none',originalSizeBytes:source.length,optimizedSizeBytes:source.length});
    expect(result.tool).toContain('kept-original-remux-incompatible');
  });
  it('does not accept an unreadable video just because remuxing failed',async()=>{
    const runner=vi.fn(async()=>{throw new Error('Invalid data found when processing input');});
    await expect(optimizeMediaLosslessly(Buffer.from('not-a-video'),'video/mp4',runner)).rejects.toThrow('Invalid data');
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
