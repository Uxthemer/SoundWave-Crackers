export type DashboardRange = "all" | "today" | "last90" | "week" | "month" | "year" | "season-2024" | "season-2025" | "season-2026" | "custom";

export const DASHBOARD_RANGES: DashboardRange[] = [
  "all",
  "today",
  "last90",
  "week",
  "month",
  "year",
  "season-2024",
  "season-2025",
  "season-2026",
  "custom",
];

// default range (change this to switch default)
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "all";