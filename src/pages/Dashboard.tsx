import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Package,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package as PackageIcon,
  Calendar,
  Search,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import { useDashboard } from "../hooks/useDashboard";
import { useProducts } from "../hooks/useProducts";
import { useAuth } from "../context/AuthContext";
import {
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
  type DashboardRange,
} from "../config/dashboardConfig";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { format } from "date-fns";
import { Analytics } from "./Analytics";
import { Orders } from "./Orders";
import { StockManagement } from "./StockManagement";
import { Expenses } from "./Expenses";
import { Users as UserList } from "./Users";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

export function Dashboard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  // configurable date range (values come from src/config/dashboardConfig.ts)
  const [dateRange, setDateRange] = useState<DashboardRange>(
    DEFAULT_DASHBOARD_RANGE
  );
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [isApplyingCustom, setIsApplyingCustom] = useState(false);
  const {
    stats,
    salesData,
    categoryData,
    loading,
    fetchDashboardData,
    topSkusChart,
    lowStockChart,
    inventorySummary,
  } = useDashboard();
  const { importProductsFromExcel } = useProducts();
  const [importStatus, setImportStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [importError, setImportError] = useState("");
  // active in-page tab: overview (dashboard), analytics, orders, stock, expenses
  const [activeTab, setActiveTab] = useState<
    "overview" | "analytics" | "users" | "orders" | "stock" | "expenses"
  >("overview");
  const isAdmin = ["admin", "superadmin"].includes(userRole?.name || "");

  // recent lists
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchRecent = async () => {
      setRecentLoading(true);
      try {
        // last 5 orders
        const { data: orders } = await supabase
          .from("orders")
          .select("id, short_id, full_name, email, total_amount, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        // last 5 users (include phone)
        const { data: users } = await supabase
          .from("user_profiles")
          .select("id, full_name, email, phone, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        if (!mounted) return;
        setRecentSales(orders || []);
        setRecentUsers(users || []);
      } catch (e) {
        console.error("Failed to fetch recent items", e);
      } finally {
        if (mounted) setRecentLoading(false);
      }
    };

    fetchRecent();
    return () => {
      mounted = false;
    };
  }, []); // run once; keep light to avoid interfering with other dashboard fetches

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleDateRangeChange = (range: DashboardRange) => {
    setDateRange(range);
    fetchDashboardData(range);
  };

  // Fetch initial data and whenever dateRange changes
  useEffect(() => {
    // for presets just call with the preset string
    if (dateRange !== "custom") {
      fetchDashboardData(dateRange);
      return;
    }
    // for custom we wait for explicit Apply (see Apply button)
  }, [dateRange]);

  // Apply custom range (start/end) when user clicks Apply
  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    const s = new Date(customStart);
    const e = new Date(customEnd);
    setIsApplyingCustom(true);
    fetchDashboardData({ startDate: s, endDate: e }).finally(() =>
      setIsApplyingCustom(false)
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportStatus("loading");
      const success = await importProductsFromExcel(file);

      if (success) {
        setImportStatus("success");
        setTimeout(() => setImportStatus("idle"), 3000);
      } else {
        setImportStatus("error");
        setImportError("Failed to import products");
      }
    } catch (error) {
      setImportStatus("error");
      setImportError(error instanceof Error ? error.message : "Import failed");
    }
  };

  const buildButtonGroup = () => {
    const tabList = [
      {
        key: "overview",
        label: "Overview",
      },
      {
        key: "analytics",
        label: "Analytics",
      },
      { key: "users", label: "Users" },
      {
        key: "orders",
        label: "Orders",
      },
      {
        key: "stock",
        label: "Stock",
      },
      {
        key: "expenses",
        label: "Expenses",
      },
    ];
    return tabList.map((t) => {
      const active = activeTab === (t.key as any);
      return (
        <button
          key={t.key}
          onClick={() => setActiveTab(t.key as any)}
          className={`px-4 py-2 rounded-lg text-sm transition-colors hover:shadow-md font-semibold ${
            active
              ? "bg-primary-orange text-white shadow-md font-semibold"
              : "bg-card hover:bg-card/70 text-text/80"
          }`}
        >
          {t.label}
        </button>
      );
    });
  };



  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="font-heading text-4xl mb-2">Dashboard</h1>
              <p className="text-text/60">
                Welcome to your SoundWave Crackers dashboard
              </p>
            </div>
          </div>

          {/* Group tab switches (pills) */}
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-2 p-1 bg-card rounded-lg ">
              {buildButtonGroup()}
            </div>
            {/* date range / import area - keep existing controls intact */}
            {activeTab === "overview" && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 ml-auto w-full sm:w-auto mt-4 sm:mt-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                  <select
                    value={dateRange}
                    onChange={(e) => {
                      const v = e.target.value as DashboardRange;
                      setDateRange(v);
                    }}
                    className="bg-card border border-card-border/10 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-orange"
                  >
                    {DASHBOARD_RANGES.map((r) => (
                      <option key={r} value={r}>
                        {r === "today"
                          ? "Today"
                          : r === "last90"
                          ? "Last 90 Days"
                          : r === "week"
                          ? "This Week"
                          : r === "month"
                          ? "This Month"
                          : r === "year"
                          ? "This Year"
                          : "Custom"}
                      </option>
                    ))}
                  </select>

                  {dateRange === "custom" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="bg-card border border-card-border/10 rounded-lg px-3 py-2"
                      />
                      <span className="text-text/60">to</span>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="bg-card border border-card-border/10 rounded-lg px-3 py-2"
                      />
                      <button
                        onClick={applyCustomRange}
                        disabled={
                          !customStart || !customEnd || isApplyingCustom
                        }
                        className="bg-primary-orange text-white rounded-lg px-3 py-2 disabled:opacity-60"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>

                {/* <div className="flex gap-2">
              <label className="flex items-center gap-2 bg-primary-orange text-white rounded-lg px-4 py-2 hover:bg-primary-red transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Import Products</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div> */}
              </div>
            )}
          </div>
        </div>

        {/* Tab content area */}
        <div className="mb-8">
          {/* Overview (original dashboard content) */}
          {activeTab === "overview" && (
            <>
              {/* keep all original dashboard overview markup here */}
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <button
                  onClick={() => navigate("/orders")}
                  className="card hover:border-primary-orange transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-text/60">Total Orders</p>
                      <h3 className="text-2xl font-bold">
                        {stats.totalOrders}
                      </h3>
                    </div>
                    <div className="bg-primary-orange/10 p-3 rounded-full">
                      <ShoppingCart className="w-6 h-6 text-primary-orange" />
                    </div>
                  </div>
                  {/* <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+12%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div> */}
                </button>

                <button
                  onClick={() => navigate("/users")}
                  className="card hover:border-primary-orange transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-text/60">Total Users</p>
                      <h3 className="text-2xl font-bold">{stats.totalUsers}</h3>
                    </div>
                    <div className="bg-primary-yellow/10 p-3 rounded-full">
                      <Users className="w-6 h-6 text-primary-yellow" />
                    </div>
                  </div>
                  {/* <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+5%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div> */}
                </button>

                <button
                  onClick={() => navigate("/orders")}
                  className="card hover:border-primary-orange transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div style={{ textAlign: "start" }}>
                      <p className="text-text/60">Revenue</p>
                      <h3 className="text-2xl font-bold">
                        ₹{stats.totalRevenue.toFixed(2)}
                      </h3>
                    </div>
                    <div className="bg-primary-red/10 p-3 rounded-full">
                      <DollarSign className="w-6 h-6 text-primary-red" />
                    </div>
                  </div>
                  {/* <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+18%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div> */}
                </button>

                <button
                  onClick={() => navigate("/orders")}
                  className="card hover:border-primary-orange transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div style={{ textAlign: "start" }}>
                      <p className="text-text/60">Profit</p>
                      <h3 className="text-2xl font-bold">
                        ₹{stats.totalProfit.toFixed(2)}
                      </h3>
                    </div>
                    <div className="bg-green-500/10 p-3 rounded-full">
                      <TrendingUp className="w-6 h-6 text-green-500" />
                    </div>
                  </div>
                  {/* <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+15%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div> */}
                </button>
              </div>

              {/* Charts + Recent / Users column */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Sales Overview (wide) */}
                <div className="card lg:col-span-2">
                  <h3 className="font-montserrat font-bold text-xl mb-6">
                    Sales Overview
                  </h3>
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
                    </div>
                  ) : (
                    <Line
                      data={salesData}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } },
                      }}
                    />
                  )}
                </div>

                {/* Right column: Recent Sales + Users */}
                <div className="flex flex-col gap-6">
                  {/* Recent Sales */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-montserrat font-bold text-lg">
                          Recent Sales
                        </h3>
                        <p className="text-text/60 text-sm">
                          You made {stats.totalOrders} sales
                        </p>
                      </div>
                      <div className="text-sm text-text/60">
                        {recentLoading ? "Loading..." : ""}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {recentSales.length === 0 && !recentLoading && (
                        <p className="text-text/60 text-sm">No recent sales</p>
                      )}
                      {recentSales.map((o: any) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-800/30 flex items-center justify-center text-sm font-semibold">
                              {o.full_name ? o.full_name.charAt(0) : "O"}
                            </div>
                            <div>
                              <div className="font-semibold">{o.full_name}</div>
                              <div className="text-text/60 text-sm">
                                {o.email || o.short_id || ""}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">
                              ₹{Number(o.total_amount || 0).toFixed(2)}
                            </div>
                            <div className="text-text/60 text-xs">
                              {format(new Date(o.created_at), "PP")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Users */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-montserrat font-bold text-lg">
                          Recent Users
                        </h3>
                        <p className="text-text/60 text-sm">
                          New signups and profiles
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {recentUsers.length === 0 && !recentLoading && (
                        <p className="text-text/60 text-sm">No recent users</p>
                      )}
                      {recentUsers.map((u: any) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-800/30 flex items-center justify-center text-sm font-semibold">
                              {u.full_name ? u.full_name.charAt(0) : "U"}
                            </div>
                            <div>
                              <div className="font-semibold">
                                {u.full_name || "—"}
                              </div>
                              {/* show phone if available, otherwise email */}
                              <div className="text-text/60 text-sm">
                                {u.phone ? u.phone : u.email || "-"}
                              </div>
                            </div>
                          </div>
                          <div className="text-text/60 text-xs">
                            {format(new Date(u.created_at), "PP")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Top SKUs by Revenue */}
                <div className="card lg:col-span-3 mt-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-montserrat font-bold text-lg">
                        Top SKUs by Revenue
                      </h3>
                      <p className="text-text/60 text-sm">
                        Top products this period
                      </p>
                    </div>
                  </div>
                  {topSkusChart.labels.length === 0 ? (
                    <div className="text-text/60 text-sm">
                      No sales data for selected range
                    </div>
                  ) : (
                    <Bar
                      data={topSkusChart}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } },
                      }}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Analytics tab */}
          {activeTab === "analytics" && (
            <div className="pt-2">
              <Analytics />
            </div>
          )}

          {/* Orders tab */}
          {activeTab === "orders" && (
            <div className="pt-2">
              <Orders />
            </div>
          )}

          {/* Stock tab */}
          {activeTab === "stock" && (
            <div className="pt-2">
              <StockManagement />
            </div>
          )}

          {/* Expenses tab */}
          {activeTab === "expenses" && (
            <div className="pt-2">
              <Expenses />
            </div>
          )}
          {/* Expenses tab */}
          {activeTab === "users" && (
            <div className="pt-2">
              <UserList />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
