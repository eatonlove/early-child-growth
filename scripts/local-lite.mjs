import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const composeFile = resolve(root, "deploy/local-lite/docker-compose.yml");
const envFile = resolve(root, "deploy/local-lite/.env");
const aiEnvFile = resolve(root, "deploy/local-lite/ai.env");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error?.code === "ENOENT") throw new Error(`未找到 ${command}，请先安装并启动 Docker Desktop`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args) {
  const envFiles = ["--env-file", envFile];
  if (existsSync(aiEnvFile)) envFiles.push("--env-file", aiEnvFile);
  run("docker", ["compose", ...envFiles, "-f", composeFile, ...args]);
}

async function prepare() {
  run(process.execPath, [resolve(root, "scripts/prepare-local-lite-env.mjs")]);
  await access(envFile);
}

async function waitForWeb() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5300/api/healthz");
      if (response.ok) return;
    } catch {
      // Containers are still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error("本地服务在60秒内未就绪，请运行 npm run local:logs 查看原因");
}

const action = process.argv[2] ?? "up";

try {
  if (action === "prepare") {
    await prepare();
  } else if (action === "up") {
    await prepare();
    compose(["up", "--build", "-d"]);
    await waitForWeb();
    run(process.execPath, [resolve(root, "scripts/verify-local-lite.mjs")]);
    console.log("同迹本地验证环境已启动：http://127.0.0.1:5300");
  } else if (action === "down") {
    await prepare();
    compose(["down"]);
  } else if (action === "reset") {
    await prepare();
    compose(["down", "--volumes", "--remove-orphans"]);
    compose(["up", "--build", "-d"]);
    await waitForWeb();
    run(process.execPath, [resolve(root, "scripts/verify-local-lite.mjs")]);
  } else if (action === "logs") {
    await prepare();
    compose(["logs", "--tail", "200", "-f"]);
  } else if (action === "status") {
    await prepare();
    compose(["ps"]);
  } else if (action === "verify") {
    await waitForWeb();
    run(process.execPath, [resolve(root, "scripts/verify-local-lite.mjs")]);
  } else {
    throw new Error(`未知本地命令: ${action}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
