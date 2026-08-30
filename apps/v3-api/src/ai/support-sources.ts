import type { QwenSearchSource } from "./qianwen-client.js";

export interface VerifiedSupportSource {
  title: string;
  url: string;
  source: string;
  authors?: string[];
  publicationYear?: number | null;
  publication?: string;
  sourceType: "academic" | "policy" | "institutional" | "practice";
  verified: true;
  retrievedAt: string;
  doi?: string;
}

const firstText = (value: unknown) => Array.isArray(value) && typeof value[0] === "string" ? value[0].trim() : "";

function sourceTypeFor(url: string): VerifiedSupportSource["sourceType"] {
  const hostname = new URL(url).hostname.toLowerCase();
  if (/gov\.cn$|moe\.gov\.cn$/.test(hostname)) return "policy";
  if (/\.edu(?:\.cn)?$|\.ac\.cn$|who\.int$|unicef\.org$/.test(hostname)) return "institutional";
  return "practice";
}

export function verifiedWebSources(items: QwenSearchSource[], retrievedAt = new Date().toISOString()): VerifiedSupportSource[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    if (seen.has(item.url)) return [];
    seen.add(item.url);
    return [{
      title: item.title,
      url: item.url,
      source: item.siteName || new URL(item.url).hostname,
      sourceType: sourceTypeFor(item.url),
      verified: true as const,
      retrievedAt,
    }];
  });
}

export async function searchAcademicSources(
  query: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 8_000,
): Promise<VerifiedSupportSource[]> {
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("rows", "5");
  endpoint.searchParams.set("select", "DOI,title,author,published,container-title,publisher,URL,type");
  const response = await fetcher(endpoint, {
    headers: { "User-Agent": "Tongji-Early-Childhood-Evidence/1.0 (mailto:support@meidaquan.com)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const payload = await response.json() as { message?: { items?: Array<Record<string, any>> } };
  const retrievedAt = new Date().toISOString();
  return (payload.message?.items ?? []).flatMap((item) => {
    const title = firstText(item.title);
    const doi = typeof item.DOI === "string" ? item.DOI.trim() : "";
    const url = doi ? `https://doi.org/${encodeURI(doi)}` : typeof item.URL === "string" ? item.URL : "";
    if (!title || !url) return [];
    const dateParts = item.published?.["date-parts"]?.[0];
    const publicationYear = Array.isArray(dateParts) && Number.isInteger(dateParts[0]) ? dateParts[0] : null;
    const authors = Array.isArray(item.author)
      ? item.author.map((author: any) => [author.given, author.family].filter((part) => typeof part === "string" && part.trim()).join(" ")).filter(Boolean).slice(0, 12)
      : [];
    const publication = firstText(item["container-title"]) || (typeof item.publisher === "string" ? item.publisher.trim() : "");
    return [{
      title,
      url,
      source: publication || "Crossref学术元数据",
      authors,
      publicationYear,
      publication,
      sourceType: "academic" as const,
      verified: true as const,
      retrievedAt,
      ...(doi ? { doi } : {}),
    }];
  });
}

export function mergeVerifiedSources(...groups: VerifiedSupportSource[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((item) => {
    const key = item.doi?.toLowerCase() || item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
