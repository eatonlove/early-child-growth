import { describe, expect, it } from "vitest";
import { chinaCalendarDate, reportEvidenceCoverage } from "./report-evidence.js";

describe("period report evidence gate", () => {
  it("uses China calendar dates and requires two distinct time points", () => {
    expect(chinaCalendarDate("2026-08-23T16:30:00.000Z")).toBe("2026-08-24");
    expect(reportEvidenceCoverage([
      { occurred_at: "2026-08-01T09:00:00+08:00" },
      { occurred_at: "2026-08-01T15:00:00+08:00" },
    ]).eligible).toBe(false);
    expect(reportEvidenceCoverage([
      { occurred_at: "2026-08-01T09:00:00+08:00" },
      { occurred_at: "2026-08-08T09:00:00+08:00" },
    ])).toMatchObject({ observationCount: 2, timePointCount: 2, eligible: true });
  });
});
