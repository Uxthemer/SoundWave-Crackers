/**
 * Season ranges used to live here as hardcoded strings ("season-2024", ...).
 * They now come from the `seasons` table, so a new season needs no code change.
 * A range is either one of the rolling presets below or `season:<uuid>`.
 */
export type DashboardPreset =
  | "all"
  | "today"
  | "last90"
  | "week"
  | "month"
  | "year"
  | "custom";

export type DashboardRange = DashboardPreset | `season:${string}`;

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  "all",
  "today",
  "last90",
  "week",
  "month",
  "year",
  "custom",
];

/** Kept for callers that still enumerate presets. */
export const DASHBOARD_RANGES: DashboardRange[] = DASHBOARD_PRESETS;

export const isSeasonRange = (range: DashboardRange): boolean =>
  typeof range === "string" && range.startsWith("season:");

export const seasonIdFromRange = (range: DashboardRange): string | null =>
  isSeasonRange(range) ? String(range).slice("season:".length) : null;

export const seasonRange = (seasonId: string): DashboardRange =>
  `season:${seasonId}` as DashboardRange;

// default range (change this to switch default)
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "all";
