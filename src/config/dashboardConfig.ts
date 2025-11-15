export type DashboardRange = "week" | "month" | "year";

export const DASHBOARD_RANGES: DashboardRange[] = ["week", "month", "year"];

// change this default to switch which ranges the app shows
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "year";