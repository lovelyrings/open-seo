/**
 * URL exclusion for the site audit crawler.
 *
 * A single compiled matcher, shared by sitemap seeding and link-following, so a
 * URL that matches any caller-supplied pattern is kept out of the audit without
 * touching robots.txt or the sitemap. Patterns are stored raw in the audit
 * config and compiled at use time, which keeps the config deterministic across
 * Workflow replays.
 */
import { z } from "zod";

// Deliberate abuse bound against regex denial-of-service: patterns come from
// untrusted MCP/tool input and each one is tested against every discovered URL.
// Capping the count and length keeps the worst-case matching cost predictable
// even if a pattern is written to backtrack pathologically.
export const MAX_EXCLUDE_PATTERNS = 25;
export const MAX_EXCLUDE_PATTERN_LENGTH = 200;

/**
 * Validates a list of raw exclusion patterns at the trust boundary: bounds the
 * count/length and rejects anything that is not a compilable RegExp, so an
 * invalid pattern fails loudly at the input instead of being silently dropped.
 * Defaults to an empty list (no exclusions).
 */
export const excludePatternsSchema = z
  .array(z.string().min(1).max(MAX_EXCLUDE_PATTERN_LENGTH))
  .max(MAX_EXCLUDE_PATTERNS)
  .superRefine((patterns, ctx) => {
    patterns.forEach((pattern, index) => {
      try {
        // Compile only to validate; the value is discarded here.
        void new RegExp(pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid regular expression: ${pattern}`,
          path: [index],
        });
      }
    });
  })
  .default([]);

/**
 * Compile the patterns once into a predicate over URLs. An empty list yields a
 * predicate that excludes nothing. Throws on an uncompilable pattern — callers
 * pass config that has already cleared {@link excludePatternsSchema}, so this
 * path only fires on genuinely malformed input.
 */
export function createUrlExcluder(
  patterns: string[],
): (url: string) => boolean {
  if (patterns.length === 0) {
    return () => false;
  }

  const compiled = patterns.map((pattern) => new RegExp(pattern));
  return (url: string) => compiled.some((regex) => regex.test(url));
}
