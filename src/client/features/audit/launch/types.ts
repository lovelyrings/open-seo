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
  excludePatternsInput: string;
};

export const DEFAULT_LAUNCH_FORM_VALUES: LaunchFormValues = {
  url: "",
  maxPagesInput: String(DEFAULT_AUDIT_PAGES),
  runLighthouse: false,
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
