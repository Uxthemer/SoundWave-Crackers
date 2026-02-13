import { useState } from "react";
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
} from "../config/dashboardConfig";

export function useDateRange() {
  const [range, setRange] = useState<DashboardRange>(() => {
    // Dynamic default: Season logic
    const now = new Date();
    const currentYear = now.getFullYear();
    // Month is 0-indexed: 0=Jan, 3=April, 4=May.
    // Logic: if > April 30th (i.e. May 1st onwards) -> current year season
    // else -> previous year season
    const isAfterApril30 = now.getMonth() >= 4; 
    const seasonYear = isAfterApril30 ? currentYear : currentYear - 1;
    return `season-${seasonYear}` as DashboardRange;
  });
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const getDateRange = () => {
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    if (range === "custom") {
       if (!customStart || !customEnd) {
         // Fallback to today if custom is incomplete (should be handled by UI usually)
         return { startDate: startOfDay(now), endDate: endOfDay(now) };
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
    } else if (String(range).startsWith("season-")) {
      const year = parseInt(String(range).split("-")[1], 10);
      startDate = startOfDay(new Date(year, 3, 1)); // April 1st
      endDate = endOfDay(new Date(year + 1, 2, 31)); // March 31st next year
    } else {
      // year (default fallback logic if not matched above, though all should match)
      startDate = startOfYear(now);
      endDate = endOfYear(now);
    }
    
    return { startDate, endDate };
  };

  return {
    range,
    setRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    getDateRange,
  };
}
