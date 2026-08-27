import { describe, expect, it } from "vitest";
import { signLocalJwt, verifyLocalJwt } from "./local-jwt.js";

const secret = "test-only-local-jwt-secret-with-more-than-32-characters";
const subject = "20000000-0000-4000-8000-000000000001";

describe("local JWT", () => {
  it("signs PostgREST-compatible access claims", () => {
    const token = signLocalJwt({ sub: subject, role: "authenticated", type: "access", aud: "authenticated" }, secret, 60);
    expect(verifyLocalJwt(token, secret, "access")).toMatchObject({ sub: subject, role: "authenticated", type: "access" });
  });

  it("rejects a token with the wrong type or signature", () => {
    const token = signLocalJwt({ sub: subject, role: "authenticated", type: "refresh" }, secret, 60);
    expect(() => verifyLocalJwt(token, secret, "access")).toThrow("Invalid token type");
    expect(() => verifyLocalJwt(`${token.slice(0, -1)}x`, secret, "refresh")).toThrow("Invalid token signature");
  });
});
