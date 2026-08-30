import { describe, expect, it, vi } from "vitest";
import { mergeVerifiedSources, searchAcademicSources, verifiedWebSources } from "./support-sources.js";

describe("verified support sources", () => {
  it("keeps Qwen-returned URLs traceable and classifies public sources", () => {
    const retrievedAt = "2026-08-30T10:00:00.000Z";
    const result = verifiedWebSources([
      { title: "教育部学前教育资料", url: "https://www.moe.gov.cn/example", siteName: "教育部" },
      { title: "高校研究中心资料", url: "https://child.example.edu.cn/research", siteName: "研究中心" },
    ], retrievedAt);

    expect(result).toMatchObject([
      { sourceType: "policy", verified: true, retrievedAt },
      { sourceType: "institutional", verified: true, retrievedAt },
    ]);
  });

  it("normalizes Crossref author, journal, year and DOI metadata", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: {
        items: [{
          DOI: "10.1000/play.2026.1",
          title: ["Play-based formative assessment"],
          author: [{ given: "Mei", family: "Lin" }],
          published: { "date-parts": [[2026, 3, 1]] },
          "container-title": ["Early Childhood Research"],
          publisher: "Example Publisher",
          URL: "https://example.org/article",
        }],
      },
    }), { status: 200 }));

    const result = await searchAcademicSources("early childhood play", fetcher);

    expect(result[0]).toMatchObject({
      title: "Play-based formative assessment",
      url: "https://doi.org/10.1000/play.2026.1",
      authors: ["Mei Lin"],
      publicationYear: 2026,
      publication: "Early Childhood Research",
      sourceType: "academic",
      verified: true,
      doi: "10.1000/play.2026.1",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("deduplicates sources by DOI before they are offered to AI", () => {
    const source = {
      title: "Article",
      url: "https://doi.org/10.1000/example",
      source: "Journal",
      sourceType: "academic" as const,
      verified: true as const,
      retrievedAt: "2026-08-30T10:00:00.000Z",
      doi: "10.1000/example",
    };

    expect(mergeVerifiedSources([source], [{ ...source, url: "https://example.org/copy" }])).toHaveLength(1);
  });
});
