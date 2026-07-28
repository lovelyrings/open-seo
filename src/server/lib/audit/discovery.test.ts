import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverUrls } from "@/server/lib/audit/discovery";
import { createUrlExcluder } from "@/server/lib/audit/exclude";

const ORIGIN = "https://example.com";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/keep-1/</loc></url>
  <url><loc>${ORIGIN}/cdn-cgi/trace/</loc></url>
  <url><loc>${ORIGIN}/keep-2/</loc></url>
</urlset>`;

function mockDiscoveryFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(SITEMAP_XML, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response("", { status: 404 });
    }),
  );
}

describe("discoverUrls exclusion", () => {
  beforeEach(mockDiscoveryFetch);
  afterEach(() => vi.unstubAllGlobals());

  it("seeds every sitemap URL when no excluder is given", async () => {
    const { urls } = await discoverUrls(ORIGIN, 50);
    expect(urls).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/keep-1/`,
        `${ORIGIN}/cdn-cgi/trace/`,
        `${ORIGIN}/keep-2/`,
      ]),
    );
  });

  it("drops sitemap URLs that match an exclude pattern", async () => {
    const { urls } = await discoverUrls(
      ORIGIN,
      50,
      createUrlExcluder(["/cdn-cgi/"]),
    );
    expect(urls).toEqual(
      expect.arrayContaining([`${ORIGIN}/keep-1/`, `${ORIGIN}/keep-2/`]),
    );
    expect(urls).not.toContain(`${ORIGIN}/cdn-cgi/trace/`);
  });
});
