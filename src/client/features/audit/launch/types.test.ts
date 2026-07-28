import { describe, expect, it } from "vitest";
import { parseExcludePatterns } from "@/client/features/audit/launch/types";

describe("parseExcludePatterns", () => {
  it("returns an empty list for an empty or whitespace-only field", () => {
    expect(parseExcludePatterns("")).toEqual([]);
    expect(parseExcludePatterns("   \n\n  \t")).toEqual([]);
  });

  it("splits one pattern per line and trims each", () => {
    expect(parseExcludePatterns("/configurator\n  /cdn-cgi/  ")).toEqual([
      "/configurator",
      "/cdn-cgi/",
    ]);
  });

  it("drops blank lines between patterns", () => {
    expect(parseExcludePatterns("/a\n\n/b\n   \n/c")).toEqual([
      "/a",
      "/b",
      "/c",
    ]);
  });
});
