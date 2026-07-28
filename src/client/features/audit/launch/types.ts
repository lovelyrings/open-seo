import {
  DEFAULT_AUDIT_PAGES,
  FREE_MAX_AUDIT_PAGES,
  MIN_AUDIT_PAGES,
  PAID_MAX_AUDIT_PAGES,
} from "@/shared/audit-limits";

export const MIN_PAGES = MIN_AUDIT_PAGES;

export function getMaxPagesLimit(isFreePlan: boolean) {
  return isFreePlan ? FREE_MAX_AUDIT_PAGES : PAID_MAX_AUDIT_PAGES;
}

export type LaunchFormValues = {
  url: string;
  maxPagesInput: string;
  runLighthouse: boolean;
  renderJavaScript: boolean;
  excludePatternsInput: string;
};

/**
 * The stored launch settings of a past audit, as surfaced by getAuditHistory.
 * Mirrors the replayable fields of the server-side AuditConfig.
 */
export type AuditLaunchSettings = {
  maxPages: number;
  lighthouseStrategy: "auto" | "none";
  excludePatterns: string[];
  renderMode: boolean;
};

/**
 * Map a past audit's stored settings onto the start form's editable fields
 * (everything except the URL, which the user chooses per run). maxPages is
 * clamped into the current plan's range so a settings replay never exceeds the
 * limit the form otherwise enforces.
 */
export function auditSettingsToFormValues(
  settings: AuditLaunchSettings,
  maxPagesLimit: number,
): Omit<LaunchFormValues, "url"> {
  const clampedMaxPages = Math.max(
    MIN_PAGES,
    Math.min(maxPagesLimit, Math.round(settings.maxPages)),
  );

  return {
    maxPagesInput: String(clampedMaxPages),
    runLighthouse: settings.lighthouseStrategy !== "none",
    renderJavaScript: settings.renderMode,
    excludePatternsInput: settings.excludePatterns.join("\n"),
  };
}

export const DEFAULT_LAUNCH_FORM_VALUES: LaunchFormValues = {
  url: "",
  maxPagesInput: String(DEFAULT_AUDIT_PAGES),
  runLighthouse: false,
  renderJavaScript: false,
  excludePatternsInput: "",
};

/**
 * Split the exclude-patterns textarea (one pattern per line) into the string[]
 * the server expects: each line trimmed, blank lines dropped. An empty or
 * whitespace-only field yields an empty list (no exclusions).
 */
export function parseExcludePatterns(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
