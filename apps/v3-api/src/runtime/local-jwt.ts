import { createHmac, timingSafeEqual } from "node:crypto";

export interface LocalJwtPayload {
  sub: string;
  role: "authenticated" | "anon" | "service_role";
  type: "access" | "refresh" | "platform";
  email?: string;
  aud?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  iat: number;
  exp: number;
  iss: string;
}

const encode = (value: string) => Buffer.from(value).toString("base64url");

function signature(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function signLocalJwt(
  payload: Omit<LocalJwtPayload, "iat" | "exp" | "iss">,
  secret: string,
  expiresInSeconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds, iss: "tongji-local-lite" }));
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${signature(unsigned, secret)}`;
}

export function verifyLocalJwt(token: string, secret: string, expectedType?: LocalJwtPayload["type"]): LocalJwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [header, body, suppliedSignature] = parts as [string, string, string];
  const expectedSignature = signature(`${header}.${body}`, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid token signature");
  const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
  if (parsedHeader.alg !== "HS256") throw new Error("Invalid token algorithm");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LocalJwtPayload;
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  if (payload.iss !== "tongji-local-lite") throw new Error("Invalid token issuer");
  if (expectedType && payload.type !== expectedType) throw new Error("Invalid token type");
  return payload;
}
