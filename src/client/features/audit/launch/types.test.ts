import { describe, expect, it } from "vitest";
import {
  auditSettingsToFormValues,
  DEFAULT_LAUNCH_FORM_VALUES,
  parseExcludePatterns,
} from "@/client/features/audit/launch/types";

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

describe("DEFAULT_LAUNCH_FORM_VALUES", () => {
  it("keeps render mode opt-in (off by default)", () => {
    expect(DEFAULT_LAUNCH_FORM_VALUES.renderJavaScript).toBe(false);
  });
});

describe("auditSettingsToFormValues", () => {
  it("maps stored settings onto the editable form fields", () => {
    expect(
      auditSettingsToFormValues(
        {
          startUrl: "https://example.com",
          maxPages: 120,
          lighthouseStrategy: "auto",
          excludePatterns: ["/configurator", "^https://.*/cdn-cgi/"],
          renderMode: true,
        },
        10_000,
      ),
    ).toEqual({
      url: "https://example.com",
      maxPagesInput: "120",
      runLighthouse: true,
      renderJavaScript: true,
      excludePatternsInput: "/configurator\n^https://.*/cdn-cgi/",
    });
  });

  it("treats lighthouseStrategy 'none' as Lighthouse off", () => {
    const values = auditSettingsToFormValues(
      {
        startUrl: "https://foo.test",
        maxPages: 50,
        lighthouseStrategy: "none",
        excludePatterns: [],
        renderMode: false,
      },
      10_000,
    );
    expect(values.runLighthouse).toBe(false);
    expect(values.excludePatternsInput).toBe("");
  });

  it("clamps maxPages into the current plan's range", () => {
    expect(
      auditSettingsToFormValues(
        {
          startUrl: "https://foo.test",
          maxPages: 999_999,
          lighthouseStrategy: "none",
          excludePatterns: [],
          renderMode: false,
        },
        50,
      ).maxPagesInput,
    ).toBe("50");
  });
});
