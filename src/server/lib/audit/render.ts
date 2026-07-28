/**
 * Server-side rendering sidecar for the site audit crawler.
 *
 * In render mode the crawler asks a browserless/chromium-compatible sidecar for
 * a page's *rendered* HTML (post-JavaScript DOM) instead of trusting the static
 * markup a plain `fetch` returns. JavaScript-built pages — e.g. a client-side
 * configurator that injects its own <h1> — otherwise read as "H1 missing" to a
 * static crawl. The rendered HTML is fed unchanged into the existing cheerio
 * analyzer, so nothing downstream changes; only the source of the body differs.
 *
 * Opt-in and best-effort: a missing service URL or any render failure returns
 * null so the caller falls back to the static body (graceful degradation). The
 * HTTP-level signals the audit relies on (status code, redirects, x-robots-tag,
 * Link canonical) always come from the direct fetch — the sidecar only supplies
 * the post-render body.
 *
 * workerd reachability (LOAD-BEARING): the Worker runs with the
 * `global_fetch_strictly_public` compatibility flag (see wrangler.jsonc), which
 * blocks `fetch` to loopback and private (RFC 1918 / link-local) addresses. So
 * RENDER_SERVICE_URL must resolve to a *publicly routable* address, OR the
 * self-hoster must drop that flag from their own build. The upstream default
 * stays strict-safe; render is opt-in. This constraint cannot be satisfied by a
 * bare `http://render:3000` compose-network address under the default flags.
 */
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/** Env var holding the sidecar's rendered-HTML endpoint (e.g. a browserless `/content` URL). */
const RENDER_SERVICE_URL_ENV = "RENDER_SERVICE_URL";

/**
 * Rendering is slow and expensive, so cap it well above the static fetch's 15s
 * budget but still bounded. Applied both to the outer request (AbortSignal) and
 * passed to the sidecar as its own navigation timeout.
 */
const RENDER_TIMEOUT_MS = 25_000;

/**
 * Bound the rendered HTML the same way the static path bounds its body (2 MiB):
 * cheerio cost scales with document size and a hostile/broken page must not
 * exhaust a crawl step's CPU or the isolate heap.
 */
export const MAX_RENDERED_HTML_CHARS = 2 * 1024 * 1024;

/** Resolved render endpoint, or undefined when render mode is not configured. */
async function getRenderServiceUrl(): Promise<string | undefined> {
  return getOptionalEnvValue(RENDER_SERVICE_URL_ENV);
}

/**
 * POST the target URL to the browserless-compatible sidecar and return its
 * rendered HTML. Throws on a non-2xx response, an empty body, or a timeout, so
 * the caller can decide between fallback and propagation.
 *
 * Sidecar contract (browserless v2 `/content`): `POST <serviceUrl>` with JSON
 * `{ url, gotoOptions: { waitUntil, timeout } }`, responding with the fully
 * rendered HTML as `text/html`. The endpoint (and any auth token) is baked into
 * `serviceUrl`, so callers need not know the sidecar's shape.
 */
export async function fetchRenderedHtml(
  url: string,
  serviceUrl: string,
  timeoutMs: number = RENDER_TIMEOUT_MS,
): Promise<string> {
  const response = await fetch(serviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/html",
    },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle2", timeout: timeoutMs },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Render service returned status ${response.status}`);
  }

  const html = await response.text();
  if (!html) {
    throw new Error("Render service returned an empty body");
  }

  return html.length > MAX_RENDERED_HTML_CHARS
    ? html.slice(0, MAX_RENDERED_HTML_CHARS)
    : html;
}

/**
 * Best-effort render: resolve the service URL, fetch rendered HTML, and return
 * it — or null when render mode is unconfigured or the sidecar fails. Never
 * throws; a null result is the caller's signal to fall back to the static body.
 */
export async function tryFetchRenderedHtml(
  url: string,
): Promise<string | null> {
  const serviceUrl = await getRenderServiceUrl();
  if (!serviceUrl) {
    console.warn(
      `Render mode requested but ${RENDER_SERVICE_URL_ENV} is unset; using static HTML for ${url}`,
    );
    return null;
  }

  try {
    return await fetchRenderedHtml(url, serviceUrl);
  } catch (error) {
    console.warn(
      `Render failed for ${url}; falling back to static HTML:`,
      error,
    );
    return null;
  }
}
