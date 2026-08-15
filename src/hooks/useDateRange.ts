import { useEffect, useState } from "react";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
} from "date-fns";
import {
  DashboardRange,
  seasonIdFromRange,
  seasonRange,
} from "../config/dashboardConfig";
import { useSeasons } from "../context/SeasonContext";

export function useDateRange() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [range, setRange] = useState<DashboardRange>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [initialised, setInitialised] = useState(false);

  // Default to the live season once seasons have loaded.
  useEffect(() => {
    if (initialised || seasonsLoading) return;

    if (activeSeason) {
      setRange(seasonRange(activeSeason.id));
    }
    // Seasons finished loading; even if there is no active season we are now
    // settled on the "all" default and pages may fetch.
    setInitialised(true);
  }, [activeSeason, initialised, seasonsLoading]);

  /**
   * False until the season list has loaded and `range` has settled.
   *
   * Pages must wait for this before their first fetch. Without it they fire
   * once against the initial "all" default and again when the range flips to
   * the active season — two in-flight requests whose responses can land out of
   * order, leaving the filter showing one season and the table showing another.
   */
  const ready = initialised && !seasonsLoading;

  const getDateRange = () => {
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    const seasonId = seasonIdFromRange(range);

    if (seasonId) {
      const season = seasons.find((s) => s.id === seasonId);
      if (season) {
        startDate = startOfDay(new Date(season.start_date));
        endDate = endOfDay(new Date(season.end_date));
        return { startDate, endDate, seasonId };
      }
      // Season no longer exists — fall through to all-time.
      startDate = startOfDay(new Date(2020, 0, 1));
      endDate = endOfDay(new Date(2100, 11, 31));
      return { startDate, endDate, seasonId: null };
    }

    if (range === "custom") {
      if (!customStart || !customEnd) {
        // Fallback to today if custom is incomplete (should be handled by UI usually)
        return { startDate: startOfDay(now), endDate: endOfDay(now), seasonId: null };
      }
      startDate = startOfDay(new Date(customStart));
      endDate = endOfDay(new Date(customEnd));
    } else if (range === "all") {
      // 2020 to 2100 - effectively "all time" for this app
      startDate = startOfDay(new Date(2020, 0, 1));
      endDate = endOfDay(new Date(2100, 11, 31));
    } else if (range === "today") {
      startDate = startOfDay(now);
      endDate = endOfDay(now);
    } else if (range === "last90") {
      endDate = endOfDay(now);
      startDate = startOfDay(subDays(now, 89));
    } else if (range === "week") {
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
    } else if (range === "month") {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else {
      // year
      startDate = startOfYear(now);
      endDate = endOfYear(now);
    }

    return { startDate, endDate, seasonId: null };
  };

  return {
    range,
    setRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    getDateRange,
    seasons,
    ready,
  };
}
