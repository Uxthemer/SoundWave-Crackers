import { DashboardRange, DASHBOARD_RANGES } from "../config/dashboardConfig";

interface DateRangeFilterProps {
  range: DashboardRange;
  setRange: (range: DashboardRange) => void;
  customStart: string;
  setCustomStart: (date: string) => void;
  customEnd: string;
  setCustomEnd: (date: string) => void;
  onApply: () => void;
  isApplying?: boolean;
}

export function DateRangeFilter({
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  onApply,
  isApplying = false,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
      <select
        value={range}
        onChange={(e) => setRange(e.target.value as DashboardRange)}
        className="bg-card border border-card-border/10 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-orange w-full sm:w-auto"
      >
        {DASHBOARD_RANGES.map((r) => (
          <option key={r} value={r}>
            {r === "all"
              ? "All Time"
              : r === "today"
              ? "Today"
              : r === "last90"
              ? "Last 90 Days"
              : r === "week"
              ? "This Week"
              : r === "month"
              ? "This Month"
              : r === "year"
              ? "This Year"
              : String(r).startsWith("season-")
              ? `Season ${String(r).split("-")[1]}`
              : "Custom"}
          </option>
        ))}
      </select>

      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-card border border-card-border/10 rounded-lg px-3 py-2 w-full sm:w-auto"
          />
          <span className="text-text/60 hidden sm:inline">to</span>
          <span className="text-text/60 sm:hidden w-full text-center">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-card border border-card-border/10 rounded-lg px-3 py-2 w-full sm:w-auto"
          />
          <button
            onClick={onApply}
            disabled={!customStart || !customEnd || isApplying}
            className="bg-primary-orange text-white rounded-lg px-3 py-2 disabled:opacity-60 w-full sm:w-auto text-center hover:bg-primary-orange/90 transition-colors"
          >
            {isApplying ? "Applying..." : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
