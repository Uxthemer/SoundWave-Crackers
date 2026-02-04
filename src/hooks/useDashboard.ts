import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  subDays,
} from "date-fns";
import { DashboardStats } from "../types";
import { DASHBOARD_RANGES, DEFAULT_DASHBOARD_RANGE, DashboardRange } from "../config/dashboardConfig";

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    totalUsers: 0,
    totalRevenue: 0,
    totalProfit: 0,
  });

  const [salesData, setSalesData] = useState({
    labels: [] as string[],
    datasets: [
      {
        label: "Sales",
        data: [] as number[],
        borderColor: "#FF5722",
        tension: 0.4,
      },
    ],
  });

  const [categoryData, setCategoryData] = useState({
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: [
          "#FF5722", // Deep Orange
          "#FFC107", // Amber
          "#FF0000", // Red
          "#8A2BE2", // Blue Violet
          "#4CAF50", // Green
          "#00BCD4", // Cyan
          "#E91E63", // Pink
          "#9C27B0", // Purple
          "#3F51B5", // Indigo
          "#2196F3", // Blue
          "#009688", // Teal
          "#CDDC39", // Lime
          "#FF9800", // Orange
          "#795548", // Brown
          "#607D8B", // Blue Grey
          "#000000", // Black
        ],
      },
    ],
  });

  // Inventory / SKUs charts state
  const [topSkusChart, setTopSkusChart] = useState({
    labels: [] as string[],
    datasets: [{ label: "Revenue", data: [] as number[], backgroundColor: "#FF5722" }],
  });
  const [lowStockChart, setLowStockChart] = useState({
    labels: [] as string[],
    datasets: [{ label: "Stock", data: [] as number[], backgroundColor: "#E53E3E" }],
  });
  const [inventorySummary, setInventorySummary] = useState({
    lowStockList: [] as any[],
    outOfStockCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accept preset ranges or a custom object { startDate, endDate }
  const fetchDashboardData = async (
    range: DashboardRange | { startDate: Date; endDate: Date } = DEFAULT_DASHBOARD_RANGE
  ) => {
    try {
      setLoading(true);

      // Resolve start/end based on preset or custom range
      let startDate: Date;
      let endDate: Date;
      if (typeof range === "object" && range.startDate && range.endDate) {
        startDate = startOfDay(range.startDate);
        endDate = endOfDay(range.endDate);
      } else {
        const preset = range as DashboardRange;
        const now = new Date();
        if (preset === "today") {
          startDate = startOfDay(now);
          endDate = endOfDay(now);
        } else if (preset === "last90") {
          endDate = endOfDay(now);
          startDate = startOfDay(subDays(now, 89)); // include today => 90 days
        } else if (preset === "week") {
          startDate = startOfWeek(now);
          endDate = endOfWeek(now);
        } else if (preset === "month") {
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
        } else if (preset === "all") {
           startDate = startOfDay(new Date(2020, 0, 1));
           endDate = endOfDay(new Date(2100, 11, 31));
        } else if (String(preset).startsWith("season-")) {
          // parse year from season-YYYY
          const year = parseInt(String(preset).split("-")[1], 10);
          // Season 2025 = April 1, 2025 to March 31, 2026
          startDate = startOfDay(new Date(year, 3, 1)); // month is 0-indexed: 3 = April
          endDate = endOfDay(new Date(year + 1, 2, 31)); // 2 = March
        } else {
          // year
          startDate = startOfYear(now);
          endDate = endOfYear(now);
        }
      }

      // consider only completed orders for revenue/profit/sales
      const COMPLETED_STATUSES = ["shipped", "dispatched", "delivered"];

      // Fetch orders within date range and include order_items -> product.apr
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          *,
          order_items:order_items (
            price,
            quantity,
            product:products (
              apr
            )
          )
        `
        )
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (ordersError) throw ordersError;

      // completed orders (case-insensitive)
      const completedOrders = (orders || []).filter((o: any) =>
        COMPLETED_STATUSES.includes((o.status || "").toString().toLowerCase())
      );

      // Calculate total revenue from completed orders
      const revenue =
        (completedOrders || []).reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0;

      // Calculate total profit based on APR, price, qty and discount (completed orders)
      const profit =
        (completedOrders || []).reduce((sum, order) => {
          if (!order.order_items) return sum;
          const orderProfit = order.order_items.reduce(
            (itemSum: number, item: any) => {
              const price = Number(item.price) || 0;
              const apr = Number(item.product?.apr) || 0;
              const qty = Number(item.quantity) || 0;
              return itemSum + (price - apr) * qty;
            },
            0
          );
          const discount = Number(order.discount_amt) || 0;
          return sum + (orderProfit - discount);
        }, 0) || 0;

      // Fetch the customer role id first
      const { data: roles, error: rolesError } = await supabase
        .from("roles")
        .select("id")
        .eq("name", "customer")
        .single();

      if (rolesError || !roles)
        throw rolesError || new Error("Customer role not found");
      const customerRoleId = roles.id;

      // Now count users with that role_id
      const { count: userCount, error: usersError } = await supabase
        .from("user_profiles")
        .select("*", { count: "exact", head: true })
        .eq("role_id", customerRoleId);

      if (usersError) throw usersError;

      setStats({
        // keep totalOrders as total fetched orders in range (matches analytics)
        totalOrders: orders?.length || 0,
        totalUsers: userCount || 0,
        totalRevenue: revenue,
        totalProfit: profit,
      });

      // Prepare sales data (use completed orders)
      // Key by ISO date so we can sort chronologically, then format labels for display
      const salesByIsoDate = (completedOrders || []).reduce((acc, order) => {
        const iso = format(new Date(order.created_at), "yyyy-MM-dd");
        acc[iso] = (acc[iso] || 0) + Number(order.total_amount || 0);
        return acc;
      }, {} as Record<string, number>);

      const sortedDates = Object.keys(salesByIsoDate).sort(); // ISO strings sort chronologically
      const labels = sortedDates.map((d) => format(new Date(d), "MMM dd"));
      const dataPoints = sortedDates.map((d) => salesByIsoDate[d]);

      setSalesData({
        labels,
        datasets: [
          {
            label: "Sales",
            data: dataPoints,
            borderColor: "#FF5722",
            tension: 0.4,
          },
        ],
      });

      // Fetch category data with product count from products table
      const { data: categories, error: categoriesError } = await supabase.from(
        "categories"
      ).select(`
          name,
          products:products (
            id
          )
        `);

      if (categoriesError) throw categoriesError;

      if (categories) {
        setCategoryData({
          labels: categories.map((cat) => cat.name),
          datasets: [
            {
              data: categories.map((cat) => cat.products.length),
              backgroundColor: [
                "#FF5722", // Deep Orange
                "#FFC107", // Amber
                "#FF0000", // Red
                "#8A2BE2", // Blue Violet
                "#4CAF50", // Green
                "#00BCD4", // Cyan
                "#E91E63", // Pink
                "#9C27B0", // Purple
                "#3F51B5", // Indigo
                "#2196F3", // Blue
                "#009688", // Teal
                "#CDDC39", // Lime
                "#FF9800", // Orange
                "#795548", // Brown
                "#607D8B", // Blue Grey
                "#000000", // Black
              ],
            },
          ],
        });
      }

      // --- Inventory & Top SKUs (charts)
      try {
        // low stock products (fetch a small set)
        const { data: products } = await supabase
          .from("products")
          .select("id,name,product_code,stock,reorder_level")
          .order("stock", { ascending: true })
          .limit(20);

        const lowStockList = (products || []).filter((p: any) => {
          const rl = Number(p.reorder_level ?? p.reorder ?? p.min_stock ?? 5);
          const st = Number(p.stock ?? 0);
          return st <= Math.max(rl, 5);
        });

        const { count: outOfStockCount } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("stock", 0);

        // build low stock chart (top 8 lowest stock)
        const lowForChart = (products || [])
          .slice(0, 8)
          .map((p: any) => ({ name: p.name || `#${p.id}`, stock: Number(p.stock ?? 0) }));

        setLowStockChart({
          labels: lowForChart.map((l) => l.name),
          datasets: [{ label: "Stock", data: lowForChart.map((l) => l.stock), backgroundColor: "#E53E3E" }],
        });

        // top SKUs by revenue in the selected date range
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("price,quantity,product:products(id,name,product_code)")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        const revMap: Record<string, { name: string; revenue: number; qty: number }> = {};
        (orderItems || []).forEach((it: any) => {
          const pid = it.product?.id ?? "unknown";
          const name = it.product?.name ?? `#${pid}`;
          const qty = Number(it.quantity) || 0;
          const amount = (Number(it.price) || 0) * qty;
          if (!revMap[pid]) revMap[pid] = { name, revenue: 0, qty: 0 };
          revMap[pid].revenue += amount;
          revMap[pid].qty += qty;
        });

        const topSkus = Object.values(revMap).sort((a, b) => b.revenue - a.revenue);
        setTopSkusChart({
          labels: topSkus.map((s) => `${s.name} (Sold: ${s.qty})`),
          datasets: [{ label: "Revenue", data: topSkus.map((s) => Math.round(s.revenue)), backgroundColor: "#FF8A65" }],
        });

        setInventorySummary({ lowStockList, outOfStockCount: Number(outOfStockCount || 0) });
      } catch (e) {
        console.warn("inventory/topSkus calculation failed", e);
        // keep charts empty but don't throw
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Set up realtime subscription for orders
  useEffect(() => {
    const subscription = supabase
      .channel("dashboard-changes")
      .on(
         "postgres_changes",
         {
           event: "*",
           schema: "public",
           table: "orders",
         },
        () => {
          // Refresh dashboard data when orders change (use configured default)
          fetchDashboardData();
        }
       )
       .subscribe();

    // Initial fetch using configured default
    fetchDashboardData();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return {
    stats,
    salesData,
    categoryData,
    topSkusChart,
    lowStockChart,
    inventorySummary,
    loading,
    error,
    fetchDashboardData,
  };
}
