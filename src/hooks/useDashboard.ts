import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { format, startOfDay, endOfDay } from "date-fns";
import { DashboardStats } from "../types";

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

  /** The range currently on screen, so realtime refreshes reuse it. */
  const lastRangeRef = useRef<{
    startDate: Date;
    endDate: Date;
    seasonId?: string | null;
  } | null>(null);

  // Inventory figures always describe some season. When a rolling date preset
  // is selected there is no season in the range, so use the live one.
  const resolveActiveSeasonId = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("seasons")
      .select("id")
      .eq("status", "active")
      .maybeSingle();
    return data?.id ?? null;
  };

  /**
   * @param range  Resolved window from useDateRange. When it carries a
   *               seasonId the query filters on orders.season_id, which is
   *               exact — date maths across the April 1 boundary is not.
   */
  const fetchDashboardData = async (
    range: {
      startDate: Date;
      endDate: Date;
      seasonId?: string | null;
    } = {
      startDate: startOfDay(new Date(2020, 0, 1)),
      endDate: endOfDay(new Date(2100, 11, 31)),
    }
  ) => {
    try {
      setLoading(true);
      lastRangeRef.current = range;

      const startDate = startOfDay(range.startDate);
      const endDate = endOfDay(range.endDate);
      const seasonId = range.seasonId ?? null;

      // consider only completed orders for revenue/profit/sales
      const COMPLETED_STATUSES = ["shipped", "dispatched", "delivered"];

      // Cost comes from order_items.apr_snapshot — frozen when the order was
      // placed. Joining live product cost made historical profit change every
      // time a price was edited.
      let ordersQuery = supabase
        .from("orders")
        .select(
          `
          *,
          order_items:order_items (
            price,
            quantity,
            apr_snapshot
          )
        `
        );

      if (seasonId) {
        ordersQuery = ordersQuery.eq("season_id", seasonId);
      } else {
        ordersQuery = ordersQuery
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());
      }

      const { data: orders, error: ordersError } = await ordersQuery;

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
              const apr = Number(item.apr_snapshot) || 0;
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
      // Stock is per-season, so these read the selected season, falling back to
      // whichever season is live when a rolling date preset is in use.
      try {
        const inventorySeasonId = seasonId ?? (await resolveActiveSeasonId());

        // low stock products (fetch a small set)
        const { data: products } = await supabase
          .from("season_catalog")
          .select("id,name,product_code,stock,reorder_level")
          .eq("season_id", inventorySeasonId ?? "")
          .eq("is_active", true)
          .order("stock", { ascending: true })
          .limit(20);

        const lowStockList = (products || []).filter((p: any) => {
          const rl = Number(p.reorder_level ?? 5);
          const st = Number(p.stock ?? 0);
          return st <= Math.max(rl, 5);
        });

        const { count: outOfStockCount } = await supabase
          .from("season_catalog")
          .select("id", { count: "exact", head: true })
          .eq("season_id", inventorySeasonId ?? "")
          .eq("is_active", true)
          .eq("stock", 0);

        // build low stock chart (top 8 lowest stock)
        const lowForChart = (products || [])
          .slice(0, 8)
          .map((p: any) => ({ name: p.name || `#${p.id}`, stock: Number(p.stock ?? 0) }));

        setLowStockChart({
          labels: lowForChart.map((l) => l.name),
          datasets: [{ label: "Stock", data: lowForChart.map((l) => l.stock), backgroundColor: "#E53E3E" }],
        });

        // top SKUs by revenue in the selected range
        let itemsQuery = supabase
          .from("order_items")
          // The embed is NOT aliased on purpose: PostgREST resolves the filter
          // below against the embed's name, so `order:orders!inner(...)` would
          // silently fail to match `orders.season_id` and the season filter
          // would be ignored.
          .select("price,quantity,product:products(id,name,product_code),orders!inner(season_id)");

        if (seasonId) {
          itemsQuery = itemsQuery.eq("orders.season_id", seasonId);
        } else {
          itemsQuery = itemsQuery
            .gte("created_at", startDate.toISOString())
            .lte("created_at", endDate.toISOString());
        }

        const { data: orderItems } = await itemsQuery;

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
          // Refresh using whatever range is currently displayed. This used to
          // call fetchDashboardData() with no arguments, which silently fell
          // back to all-time — so any order change wiped out the selected
          // season's figures.
          if (lastRangeRef.current) {
            fetchDashboardData(lastRangeRef.current);
          }
        }
       )
       .subscribe();

    // No initial fetch here. The page owns the first fetch and issues it once
    // the season list has settled; firing an all-time request here as well
    // produced two in-flight responses that could land out of order.

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
