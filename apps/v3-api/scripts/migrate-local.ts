import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { config } from "../src/config.js";

if (!config.isLocalLite) throw new Error("本地迁移器只允许在 RUNTIME_MODE=local-lite 下运行");

const migrationsDir = resolve(process.cwd(), "migrations");
const pool = new Pool({ connectionString: config.LOCAL_DATABASE_URL });
const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

try {
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await pool.query<{ checksum: string }>("select checksum from tongji_local.schema_migrations where version = $1", [file]);
    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`已应用迁移 ${file} 的内容发生变化，请新增迁移文件或执行 npm run local:reset`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into tongji_local.schema_migrations (version, checksum) values ($1, $2)", [file, checksum]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
