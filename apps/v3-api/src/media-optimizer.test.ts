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
});
