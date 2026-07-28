import { afterEach, describe, expect, it, vi } from "vitest";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  fetchRenderedHtml,
  MAX_RENDERED_HTML_CHARS,
  tryFetchRenderedHtml,
} from "@/server/lib/audit/render";

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(),
}));

const getOptionalEnvValueMock = vi.mocked(getOptionalEnvValue);

function stubFetch(
  impl: (input: unknown, init?: unknown) => Promise<Response>,
) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRenderedHtml", () => {
  it("POSTs the target url to the sidecar and returns rendered HTML", async () => {
    let capturedUrl: unknown;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        capturedUrl = input;
        capturedInit = init;
        return Promise.resolve(
          htmlResponse("<html><body><h1>Rendered</h1></body></html>"),
        );
      }),
    );

    const html = await fetchRenderedHtml(
      "https://example.com/p",
      "https://render.test/content",
    );

    expect(html).toContain("<h1>Rendered</h1>");
    expect(capturedUrl).toBe("https://render.test/content");
    expect(capturedInit?.method).toBe("POST");
    const bodyString =
      typeof capturedInit?.body === "string" ? capturedInit.body : "";
    expect(bodyString).toContain('"url":"https://example.com/p"');
  });

  it("throws on a non-2xx sidecar response", async () => {
    stubFetch(async () => htmlResponse("nope", 500));
    await expect(
      fetchRenderedHtml("https://example.com", "https://render.test/content"),
    ).rejects.toThrow(/status 500/);
  });

  it("throws on an empty sidecar body", async () => {
    stubFetch(async () => htmlResponse("", 200));
    await expect(
      fetchRenderedHtml("https://example.com", "https://render.test/content"),
    ).rejects.toThrow(/empty/);
  });

  it("caps oversized rendered HTML at the byte bound", async () => {
    const huge = "x".repeat(MAX_RENDERED_HTML_CHARS + 100);
    stubFetch(async () => htmlResponse(huge, 200));

    const html = await fetchRenderedHtml(
      "https://example.com",
      "https://render.test/content",
    );

    expect(html.length).toBe(MAX_RENDERED_HTML_CHARS);
  });
});

describe("tryFetchRenderedHtml", () => {
  it("returns null (and never calls the sidecar) when the service url is unset", async () => {
    getOptionalEnvValueMock.mockResolvedValue(undefined);
    const fetchMock = stubFetch(async () => htmlResponse("<html></html>"));

    expect(await tryFetchRenderedHtml("https://example.com")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the rendered HTML when the sidecar succeeds", async () => {
    getOptionalEnvValueMock.mockResolvedValue("https://render.test/content");
    stubFetch(async () => htmlResponse("<html><body>ok</body></html>"));

    expect(await tryFetchRenderedHtml("https://example.com")).toContain("ok");
  });

  it("returns null (fallback) when the sidecar fails", async () => {
    getOptionalEnvValueMock.mockResolvedValue("https://render.test/content");
    stubFetch(async () => htmlResponse("boom", 502));

    expect(await tryFetchRenderedHtml("https://example.com")).toBeNull();
  });
});
