export type DashboardRange = "today" | "last90" | "week" | "month" | "year" | "custom";

export const DASHBOARD_RANGES: DashboardRange[] = [
  "today",
  "last90",
  "week",
  "month",
  "year",
  "custom",
];

// default range (change this to switch default)
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "year";