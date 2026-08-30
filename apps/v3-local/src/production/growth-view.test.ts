import { describe, expect, it } from "vitest";
import { filterGrowthTimelineByTheme } from "./pages";
import type { RemoteGrowthResult } from "./types";

const timeline = [
  { observation: { id: "robot", theme: "机器人搭建" } },
  { observation: { id: "bubble", theme: "泡泡探秘" } },
  { observation: { id: "robot-2", theme: "机器人搭建延伸" } },
] as RemoteGrowthResult["timeline"];

describe("filterGrowthTimelineByTheme", () => {
  it("returns all records when no theme is selected", () => {
    expect(filterGrowthTimelineByTheme(timeline, "")).toBe(timeline);
  });

  it("uses exact theme matching so unrelated records are hidden", () => {
    expect(filterGrowthTimelineByTheme(timeline, "机器人搭建").map((item) => item.observation.id)).toEqual(["robot"]);
  });
});
