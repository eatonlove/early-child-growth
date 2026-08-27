import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const targetDir = resolve(process.cwd(), "deploy/local-lite");
const targetFile = resolve(targetDir, ".env");
const secret = process.env.TONGJI_LOCAL_JWT_SECRET ?? "tongji-local-lite-jwt-secret-do-not-use-in-production-2026";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const platformToken = (role) => {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({
    sub: "00000000-0000-4000-8000-000000000000",
    role,
    type: "platform",
    aud: role,
    iss: "tongji-local-lite",
    iat: 1_700_000_000,
    exp: 4_102_444_800,
  });
  const unsigned = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
};

await mkdir(targetDir, { recursive: true });
await writeFile(targetFile, [
  "# Generated local-only configuration. Never use these values in production.",
  "POSTGRES_PASSWORD=tongji_local_postgres",
  `LOCAL_JWT_SECRET=${secret}`,
  `LOCAL_ANON_KEY=${platformToken("anon")}`,
  `LOCAL_SERVICE_ROLE_KEY=${platformToken("service_role")}`,
  "",
].join("\n"), { mode: 0o600 });

console.log(`prepared ${targetFile}`);
