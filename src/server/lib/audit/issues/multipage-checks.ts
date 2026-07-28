/**
 * Pure cross-page checks (no database access): duplicate grouping,
 * redirect chain/loop detection, and broken-internal-link aggregation.
 * The D1 queries that feed these live in multipage.ts.
 */
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";

const DUPLICATE_GROUP_SAMPLE = 3;
// Cap the source pages we store per broken target so a link in a site-wide
// template (footer/nav) can't bloat one issue row. sourceCount keeps the true
// total; the UI/CSV note "…and N more".
const BROKEN_LINK_SOURCE_SAMPLE = 50;

/** One crawled edge whose target returned a 4xx/5xx. */
export interface BrokenLinkEdge {
  sourcePageId: string;
  sourceUrl: string;
  targetUrl: string;
  targetStatus: number | null;
  anchor: string | null;
}

/** One place a broken target is linked from: the page and its anchor text. */
interface BrokenLinkSource {
  url: string;
  anchor: string | null;
}

/**
 * Aggregate broken-link edges into ONE issue per broken target, carrying every
 * source page (with its anchor text) that links to it. Fixing a broken link
 * means editing the pages that point at it, so the report has to name them all
 * — not just a single deduplicated hit.
 *
 * The representative pageUrl (the alphabetically-first source) is stable for a
 * given edge set, so the deterministic issue row id stays stable across step
 * retries.
 */
export function buildBrokenLinkIssues(
  edges: BrokenLinkEdge[],
): DetectedIssue[] {
  const byTarget = new Map<string, BrokenLinkEdge[]>();
  for (const edge of edges) {
    const group = byTarget.get(edge.targetUrl);
    if (group) group.push(edge);
    else byTarget.set(edge.targetUrl, [edge]);
  }

  const issues: DetectedIssue[] = [];
  for (const [targetUrl, group] of byTarget) {
    const sorted = group.toSorted((a, b) =>
      a.sourceUrl < b.sourceUrl ? -1 : a.sourceUrl > b.sourceUrl ? 1 : 0,
    );

    // Defensively dedupe identical (source url, anchor) pairs.
    const seen = new Set<string>();
    const sources: BrokenLinkSource[] = [];
    for (const edge of sorted) {
      const key = `${edge.sourceUrl}\n${edge.anchor ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ url: edge.sourceUrl, anchor: edge.anchor });
    }

    const representative = sorted[0];
    issues.push({
      issueType: "broken-internal-link",
      pageId: representative.sourcePageId,
      pageUrl: representative.sourceUrl,
      dedupeKey: targetUrl,
      details: {
        targetUrl,
        targetStatus: group[0].targetStatus,
        sources: sources.slice(0, BROKEN_LINK_SOURCE_SAMPLE),
        sourceCount: sources.length,
      },
    });
  }

  return issues;
}

export interface SlimPage {
  id: string;
  url: string;
  statusCode: number | null;
  fetchClass: "ok" | "blocked" | "error";
  title: string | null;
  metaDescription: string | null;
  contentHash: string | null;
  redirectUrl: string | null;
  wordCount: number;
  isIndexable: boolean;
  canonicalUrl: string | null;
  headerCanonicalUrl: string | null;
}

function isOkHtmlPage(page: SlimPage): boolean {
  return (
    page.fetchClass === "ok" &&
    page.statusCode !== null &&
    page.statusCode >= 200 &&
    page.statusCode < 300
  );
}

/**
 * Pages the owner already de-duplicated (noindex, or canonicalized to
 * another URL) don't belong in duplicate groups — flagging them tells the
 * user to fix something they already fixed.
 */
function isDuplicateCandidate(page: SlimPage): boolean {
  if (!isOkHtmlPage(page) || !page.isIndexable) return false;
  const effectiveCanonical = page.canonicalUrl ?? page.headerCanonicalUrl;
  return !effectiveCanonical || effectiveCanonical === page.url;
}

export function findDuplicates(pages: SlimPage[]): DetectedIssue[] {
  const okPages = pages.filter(isDuplicateCandidate);

  const groupBy = (
    keyOf: (page: SlimPage) => string | null,
  ): Map<string, SlimPage[]> => {
    const groups = new Map<string, SlimPage[]>();
    for (const page of okPages) {
      const key = keyOf(page);
      if (!key) continue;
      const group = groups.get(key);
      if (group) group.push(page);
      else groups.set(key, [page]);
    }
    return groups;
  };

  const issues: DetectedIssue[] = [];
  const emitGroups = (
    groups: Map<string, SlimPage[]>,
    issueType: DetectedIssue["issueType"],
  ) => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const page of group) {
        issues.push({
          issueType,
          pageId: page.id,
          pageUrl: page.url,
          details: {
            groupSize: group.length,
            otherUrls: group
              .filter((other) => other.id !== page.id)
              .slice(0, DUPLICATE_GROUP_SAMPLE)
              .map((other) => other.url),
          },
        });
      }
    }
  };

  emitGroups(
    groupBy((page) => page.title || null),
    "duplicate-title",
  );
  emitGroups(
    groupBy((page) => page.metaDescription || null),
    "duplicate-meta-description",
  );
  emitGroups(
    groupBy((page) => (page.wordCount > 0 ? page.contentHash : null)),
    "duplicate-content",
  );
  return issues;
}

export function findRedirectChainsAndLoops(pages: SlimPage[]): DetectedIssue[] {
  const redirects = new Map<string, SlimPage>();
  for (const page of pages) {
    const isRedirect =
      page.statusCode !== null &&
      page.statusCode >= 300 &&
      page.statusCode < 400 &&
      page.redirectUrl;
    if (isRedirect) redirects.set(page.url, page);
  }

  const redirectTargets = new Set(
    Array.from(redirects.values(), (page) => page.redirectUrl!),
  );

  const issues: DetectedIssue[] = [];
  const walked = new Set<string>();

  // Walk from chain heads (redirects nothing else redirects to), so a 5-hop
  // chain yields one issue, not five.
  for (const [url, head] of redirects) {
    if (redirectTargets.has(url)) continue;

    const hops: string[] = [url];
    const seen = new Set(hops);
    walked.add(url);
    let current = head.redirectUrl;
    let isLoop = false;
    while (current) {
      if (seen.has(current)) {
        isLoop = true;
        hops.push(current);
        break;
      }
      hops.push(current);
      seen.add(current);
      if (redirects.has(current)) walked.add(current);
      current = redirects.get(current)?.redirectUrl ?? null;
    }

    if (isLoop) {
      issues.push({
        issueType: "redirect-loop",
        pageId: head.id,
        pageUrl: url,
        details: { hops },
      });
    } else if (hops.length > 2) {
      // url -> a -> b: two redirects before content = a chain
      issues.push({
        issueType: "redirect-chain",
        pageId: head.id,
        pageUrl: url,
        details: { hops, finalUrl: hops[hops.length - 1] },
      });
    }
  }

  // Headless cycles (every member is also a target — e.g. a↔b, or a→a) are
  // never reached from a head; emit one loop issue per cycle.
  for (const [url, page] of redirects) {
    if (walked.has(url)) continue;

    const cycle: string[] = [];
    let current: string | null = url;
    while (current && !walked.has(current)) {
      walked.add(current);
      cycle.push(current);
      current = redirects.get(current)?.redirectUrl ?? null;
    }
    issues.push({
      issueType: "redirect-loop",
      pageId: page.id,
      pageUrl: url,
      details: { hops: [...cycle, url] },
    });
  }

  return issues;
}
