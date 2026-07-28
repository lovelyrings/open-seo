import { afterEach, describe, expect, it, vi } from "vitest";
import { tryFetchRenderedHtml } from "@/server/lib/audit/render";
import { crawlPage } from "@/server/workflows/site-audit-workflow-helpers";

vi.mock("@/server/lib/audit/render", () => ({
  tryFetchRenderedHtml: vi.fn(),
}));

const tryFetchRenderedHtmlMock = vi.mocked(tryFetchRenderedHtml);

const STATIC_HTML =
  "<html><head><title>Static</title></head><body><p>No heading here.</p></body></html>";
const RENDERED_HTML =
  "<html><head><title>Rendered</title></head><body><h1>Rendered heading</h1></body></html>";

function stubStaticFetch(html: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crawlPage render mode", () => {
  it("feeds the sidecar's rendered HTML into the analysis when render mode is on", async () => {
    stubStaticFetch(STATIC_HTML);
    tryFetchRenderedHtmlMock.mockResolvedValue(RENDERED_HTML);

    const result = await crawlPage("https://example.com/p", 0, false, true);

    expect(tryFetchRenderedHtmlMock).toHaveBeenCalledWith(
      "https://example.com/p",
    );
    expect(result.title).toBe("Rendered");
    expect(result.h1Count).toBe(1);
  });

  it("falls back to the static HTML when the sidecar returns null", async () => {
    stubStaticFetch(STATIC_HTML);
    tryFetchRenderedHtmlMock.mockResolvedValue(null);

    const result = await crawlPage("https://example.com/p", 0, false, true);

    expect(tryFetchRenderedHtmlMock).toHaveBeenCalledOnce();
    expect(result.title).toBe("Static");
    expect(result.h1Count).toBe(0);
  });

  it("never calls the sidecar when render mode is off", async () => {
    stubStaticFetch(STATIC_HTML);

    const result = await crawlPage("https://example.com/p", 0, false, false);

    expect(tryFetchRenderedHtmlMock).not.toHaveBeenCalled();
    expect(result.title).toBe("Static");
  });
});
