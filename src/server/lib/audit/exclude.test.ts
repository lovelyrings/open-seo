import { describe, expect, it } from "vitest";
import {
  createUrlExcluder,
  excludePatternsSchema,
  MAX_EXCLUDE_PATTERNS,
  MAX_EXCLUDE_PATTERN_LENGTH,
} from "@/server/lib/audit/exclude";

describe("createUrlExcluder", () => {
  it("excludes nothing for an empty pattern list", () => {
    const isExcluded = createUrlExcluder([]);
    expect(isExcluded("https://example.com/anything")).toBe(false);
  });

  it("matches URLs against a single pattern", () => {
    const isExcluded = createUrlExcluder(["/cdn-cgi/"]);
    expect(isExcluded("https://example.com/cdn-cgi/l/email-protection")).toBe(
      true,
    );
    expect(isExcluded("https://example.com/ringe/")).toBe(false);
  });

  it("excludes a URL matching any of several patterns", () => {
    const isExcluded = createUrlExcluder(["/cdn-cgi/", "\\?configurator="]);
    expect(isExcluded("https://example.com/cdn-cgi/x")).toBe(true);
    expect(isExcluded("https://example.com/p?configurator=abc")).toBe(true);
    expect(isExcluded("https://example.com/blog/post")).toBe(false);
  });

  it("throws on an uncompilable pattern", () => {
    expect(() => createUrlExcluder(["("])).toThrow();
  });
});

describe("excludePatternsSchema", () => {
  it("defaults to an empty list when omitted", () => {
    expect(excludePatternsSchema.parse(undefined)).toEqual([]);
  });

  it("accepts a list of valid patterns", () => {
    expect(excludePatternsSchema.parse(["/cdn-cgi/", "\\.pdf$"])).toEqual([
      "/cdn-cgi/",
      "\\.pdf$",
    ]);
  });

  it("rejects an invalid regular expression", () => {
    const result = excludePatternsSchema.safeParse(["("]);
    expect(result.success).toBe(false);
  });

  it("rejects more than the maximum number of patterns", () => {
    const tooMany = Array.from(
      { length: MAX_EXCLUDE_PATTERNS + 1 },
      (_, i) => `/p${i}/`,
    );
    expect(excludePatternsSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects a pattern longer than the maximum length", () => {
    const tooLong = "a".repeat(MAX_EXCLUDE_PATTERN_LENGTH + 1);
    expect(excludePatternsSchema.safeParse([tooLong]).success).toBe(false);
  });

  it("rejects an empty-string pattern", () => {
    expect(excludePatternsSchema.safeParse([""]).success).toBe(false);
  });
});
