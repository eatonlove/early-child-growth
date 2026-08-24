import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const assets = await readdir(path.join(process.cwd(), "apps/v3-local/dist/assets"));
const hasProductionApp = assets.some((name) => name.startsWith("ProductionApp-"));
const localOnlyChunks = assets.filter((name) => name.startsWith("App-") || name.startsWith("local-data-"));

if (!hasProductionApp || localOnlyChunks.length) {
  console.error(`生产前端构建边界错误。ProductionApp=${hasProductionApp}，本地演示分块=${localOnlyChunks.join(",") || "无"}`);
  process.exit(1);
}

console.log("生产前端构建边界检查通过：仅包含正式数据应用，不包含本地演示数据分块。");
