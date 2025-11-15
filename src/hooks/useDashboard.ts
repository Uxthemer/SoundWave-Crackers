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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async (dateRange: DashboardRange = DEFAULT_DASHBOARD_RANGE) => {
    try {
      setLoading(true);

      // Get date range
      let startDate: Date;
      let endDate: Date;
      if (dateRange === "week") {
        startDate = startOfWeek(new Date());
        endDate = endOfWeek(new Date());
      } else if (dateRange === "month") {
        startDate = startOfMonth(new Date());
        endDate = endOfMonth(new Date());
      } else {
        // year
        startDate = startOfYear(new Date());
        endDate = endOfYear(new Date());
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
    loading,
    error,
    fetchDashboardData,
  };
}
