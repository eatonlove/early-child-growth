import { describe, expect, it } from "vitest";
import { isUnauthenticatedError, RemoteApiError } from "./api";

describe("production API error boundary", () => {
  it("treats only authentication and account access responses as logged out", () => {
    expect(isUnauthenticatedError(new RemoteApiError(401, "AUTH_REQUIRED", "请先登录"))).toBe(true);
    expect(isUnauthenticatedError(new RemoteApiError(403, "ACCOUNT_DISABLED", "账号已停用"))).toBe(true);
    expect(isUnauthenticatedError(new RemoteApiError(500, "PROFILE_LOOKUP_FAILED", "服务失败"))).toBe(false);
    expect(isUnauthenticatedError(new TypeError("Failed to fetch"))).toBe(false);
  });
});
