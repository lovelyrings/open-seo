import { describe, expect, it } from "vitest";
import {
  buildBrokenLinkIssues,
  type BrokenLinkEdge,
} from "@/server/lib/audit/issues/multipage-checks";

function edge(overrides: Partial<BrokenLinkEdge>): BrokenLinkEdge {
  return {
    sourcePageId: "p1",
    sourceUrl: "https://x.test/a",
    targetUrl: "https://x.test/gone",
    targetStatus: 404,
    anchor: null,
    ...overrides,
  };
}

describe("buildBrokenLinkIssues", () => {
  it("emits one issue per broken target with every source and anchor", () => {
    const issues = buildBrokenLinkIssues([
      edge({
        sourcePageId: "p2",
        sourceUrl: "https://x.test/blog",
        anchor: "read more",
      }),
      edge({
        sourcePageId: "p1",
        sourceUrl: "https://x.test/about",
        anchor: "our story",
      }),
    ]);

    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.issueType).toBe("broken-internal-link");
    expect(issue.dedupeKey).toBe("https://x.test/gone");
    expect(issue.details).toEqual({
      targetUrl: "https://x.test/gone",
      targetStatus: 404,
      sources: [
        { url: "https://x.test/about", anchor: "our story" },
        { url: "https://x.test/blog", anchor: "read more" },
      ],
      sourceCount: 2,
    });
  });

  it("groups distinct targets into separate issues", () => {
    const issues = buildBrokenLinkIssues([
      edge({ targetUrl: "https://x.test/gone-1" }),
      edge({ targetUrl: "https://x.test/gone-2" }),
    ]);

    expect(
      issues
        .map((issue) => issue.dedupeKey ?? "")
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["https://x.test/gone-1", "https://x.test/gone-2"]);
  });

  it("picks a deterministic representative page (alphabetically first source)", () => {
    const first = buildBrokenLinkIssues([
      edge({ sourcePageId: "pz", sourceUrl: "https://x.test/z" }),
      edge({ sourcePageId: "pa", sourceUrl: "https://x.test/a" }),
    ]);
    const reversed = buildBrokenLinkIssues([
      edge({ sourcePageId: "pa", sourceUrl: "https://x.test/a" }),
      edge({ sourcePageId: "pz", sourceUrl: "https://x.test/z" }),
    ]);

    expect(first[0].pageUrl).toBe("https://x.test/a");
    expect(first[0].pageId).toBe("pa");
    // Input order must not change the representative → stable row id.
    expect(reversed[0].pageUrl).toBe(first[0].pageUrl);
    expect(reversed[0].pageId).toBe(first[0].pageId);
  });

  it("dedupes identical (source url, anchor) pairs", () => {
    const issues = buildBrokenLinkIssues([
      edge({ sourceUrl: "https://x.test/a", anchor: "link" }),
      edge({ sourceUrl: "https://x.test/a", anchor: "link" }),
    ]);

    expect(issues[0].details?.sourceCount).toBe(1);
  });

  it("returns no issues for no edges", () => {
    expect(buildBrokenLinkIssues([])).toEqual([]);
  });
});
