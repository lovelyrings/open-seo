import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import type { AuditResultsData } from "@/client/features/audit/results/types";

type AuditIssueRow = AuditResultsData["issues"][number];

const MAX_RENDERED_URLS = 100;

const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: "bg-error",
  warning: "bg-warning",
  info: "bg-base-content/30",
};

const SEVERITY_RULE: Record<IssueSeverity, string> = {
  critical: "border-l-error/60",
  warning: "border-l-warning/60",
  info: "border-l-base-content/20",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

interface IssueGroup {
  issueType: string;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  howToFix: string;
  issues: AuditIssueRow[];
}

export function resolveIssueSeverity(issue: {
  issueType: string;
  severity: string;
}): IssueSeverity {
  const descriptor = getIssueDescriptor(issue.issueType);
  if (descriptor) return descriptor.severity;
  return issue.severity === "critical" || issue.severity === "warning"
    ? issue.severity
    : "info";
}

function groupIssues(issues: AuditIssueRow[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    let group = groups.get(issue.issueType);
    if (!group) {
      const descriptor = getIssueDescriptor(issue.issueType);
      group = {
        issueType: issue.issueType,
        severity: resolveIssueSeverity(issue),
        title: descriptor?.title ?? issue.issueType,
        explanation: descriptor?.explanation ?? "",
        howToFix: descriptor?.howToFix ?? "",
        issues: [],
      };
      groups.set(issue.issueType, group);
    }
    group.issues.push(issue);
  }

  return Array.from(groups.values()).toSorted(
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
      b.issues.length - a.issues.length,
  );
}

export function IssuesView({ issues }: { issues: AuditIssueRow[] }) {
  const groups = useMemo(() => groupIssues(issues), [issues]);

  const sections = useMemo(
    () =>
      (["critical", "warning", "info"] as const)
        .map((severity) => ({
          severity,
          groups: groups.filter((group) => group.severity === severity),
        }))
        .filter((section) => section.groups.length > 0),
    [groups],
  );

  if (issues.length === 0) {
    return (
      <div className="py-10 text-center text-base-content/60">
        <p className="font-medium">No issues recorded for this audit.</p>
        <p className="text-sm mt-1">
          Either the site is in great shape, or this audit ran before issue
          checks existed — run a new audit to get the full report.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-base-300 rounded-lg overflow-hidden">
      {sections.map((section) => (
        <IssueSection key={section.severity} section={section} />
      ))}
    </div>
  );
}

function IssueSection({
  section,
}: {
  section: { severity: IssueSeverity; groups: IssueGroup[] };
}) {
  const issueCount = section.groups.reduce(
    (sum, group) => sum + group.issues.length,
    0,
  );

  return (
    <div className="border-t border-base-300 first:border-t-0">
      <div className="flex items-center gap-2 bg-base-200/60 px-4 py-1.5 border-b border-base-300/60">
        <span
          className={`size-1.5 rounded-full ${SEVERITY_DOT[section.severity]}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-base-content/60">
          {SEVERITY_LABEL[section.severity]}
        </span>
        <span className="text-[11px] tabular-nums text-base-content/40">
          {issueCount}
        </span>
      </div>
      <div className="divide-y divide-base-300/60">
        {section.groups.map((group) => (
          <IssueRow key={group.issueType} group={group} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({ group }: { group: IssueGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={
        open
          ? `border-l-2 ${SEVERITY_RULE[group.severity]} bg-base-200/20`
          : "border-l-2 border-l-transparent"
      }
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-base-200/40 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[group.severity]}`}
        />
        <span className="text-sm font-medium flex-1 min-w-0 truncate">
          {group.title}
        </span>
        <span className="text-xs tabular-nums text-base-content/50 shrink-0">
          {group.issues.length} {group.issues.length === 1 ? "page" : "pages"}
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-base-content/40 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="pl-9 pr-4 pb-4 pt-0.5 space-y-3">
          {group.explanation && (
            <p className="text-sm text-base-content/70 max-w-prose">
              {group.explanation}
            </p>
          )}
          {group.howToFix && (
            <p className="text-sm max-w-prose">
              <span className="font-medium">How to fix: </span>
              <span className="text-base-content/80">{group.howToFix}</span>
            </p>
          )}
          <AffectedUrlList issues={group.issues} />
        </div>
      )}
    </div>
  );
}

function AffectedUrlList({ issues }: { issues: AuditIssueRow[] }) {
  const rendered = issues.slice(0, MAX_RENDERED_URLS);
  const remaining = issues.length - rendered.length;

  return (
    <div className="max-h-[320px] overflow-y-auto rounded border border-base-300/60 bg-base-100">
      {rendered.map((issue) => (
        <div
          key={issue.id}
          className="px-3 py-1.5 text-sm flex flex-col gap-0.5 border-b border-base-300/50 last:border-b-0"
        >
          <a
            className="link link-hover text-base-content/80 truncate"
            href={issue.pageUrl}
            target="_blank"
            rel="noreferrer"
            title={issue.pageUrl}
          >
            {issue.pageUrl}
          </a>
          <IssueDetails detailsJson={issue.detailsJson} />
        </div>
      ))}
      {remaining > 0 && (
        <div className="px-3 py-2 text-xs text-base-content/50">
          …and {remaining} more — export the issues CSV for the full list.
        </div>
      )}
    </div>
  );
}

function parseDetails(detailsJson: string): Array<[string, unknown]> | null {
  try {
    const parsed: unknown = JSON.parse(detailsJson);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return Object.entries(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

interface BrokenLinkSource {
  url: string;
  anchor: string | null;
}

const MAX_RENDERED_SOURCES = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSources(value: unknown): BrokenLinkSource[] | null {
  if (!Array.isArray(value)) return null;
  const entries: unknown[] = value;
  const sources: BrokenLinkSource[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const url = entry.url;
    if (typeof url !== "string") continue;
    const anchor = entry.anchor;
    sources.push({ url, anchor: typeof anchor === "string" ? anchor : null });
  }
  return sources.length > 0 ? sources : null;
}

function IssueDetails({ detailsJson }: { detailsJson: string | null }) {
  const details = useMemo(
    () => (detailsJson ? parseDetails(detailsJson) : null),
    [detailsJson],
  );

  if (!details) return null;

  const entries = details.filter(
    ([, value]) => value !== null && value !== undefined,
  );
  if (entries.length === 0) return null;

  // broken-internal-link carries a `sources` array (the pages that link to the
  // broken target, with anchor text). Render it as a list so the user can see
  // exactly where to fix the link; show the rest inline as before.
  const sourcesEntry = entries.find(([key]) => key === "sources");
  const sources = sourcesEntry ? parseSources(sourcesEntry[1]) : null;
  const scalarEntries = entries.filter(([key]) => key !== "sources");
  const sourceCount = (() => {
    const raw = entries.find(([key]) => key === "sourceCount")?.[1];
    return typeof raw === "number" ? raw : (sources?.length ?? 0);
  })();

  return (
    <>
      {scalarEntries.length > 0 && (
        <span className="text-xs text-base-content/50 truncate">
          {scalarEntries
            .map(([key, value]) => {
              const rendered = Array.isArray(value)
                ? value.join(" → ")
                : String(value);
              return `${key}: ${rendered}`;
            })
            .join(" · ")}
        </span>
      )}
      {sources && (
        <BrokenLinkSourceList sources={sources} sourceCount={sourceCount} />
      )}
    </>
  );
}

function BrokenLinkSourceList({
  sources,
  sourceCount,
}: {
  sources: BrokenLinkSource[];
  sourceCount: number;
}) {
  const rendered = sources.slice(0, MAX_RENDERED_SOURCES);
  const remaining = sourceCount - rendered.length;

  return (
    <div className="mt-1 space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">
        Linked from {sourceCount} {sourceCount === 1 ? "page" : "pages"}
      </span>
      <ul className="space-y-0.5">
        {rendered.map((source) => (
          <li
            key={`${source.url}\n${source.anchor ?? ""}`}
            className="text-xs text-base-content/60 flex flex-wrap items-baseline gap-x-1.5"
          >
            <a
              className="link link-hover truncate max-w-full"
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.url}
            >
              {source.url}
            </a>
            {source.anchor ? (
              <span className="text-base-content/40 italic truncate">
                “{source.anchor}”
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <span className="text-[11px] text-base-content/40">
          …and {remaining} more. Export the issues CSV for the full list.
        </span>
      ) : null}
    </div>
  );
}
