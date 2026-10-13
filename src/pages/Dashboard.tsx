import { Link, useNavigate } from "react-router-dom";
import {
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
  Eye,
  EyeOff,
  Wallet,
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

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { format } from "date-fns";
import { Analytics } from "./Analytics";
import { Orders } from "./Orders";
import { StockManagement } from "./StockManagement";
import { Expenses } from "./Expenses";
import { Users as UserList } from "./Users";
import { Vendors } from "./Vendors";
import { ExpandableChart } from "../components/ExpandableChart";
import { useDateRange } from "../hooks/useDateRange";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { QuotationsList } from "../components/QuotationsList";

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

  // configurable date range (values come from src/config/dashboardConfig.ts)
  const navigate = useNavigate();
  const { userRole } = useAuth();
  
  // configurable date range (values come from src/config/dashboardConfig.ts)
  // Kept whole as well as destructured: the Analytics tab is handed the same
  // object so it shows the season picked here, not a fresh default of its own.
  const dateRange = useDateRange();
  const { range, setRange, customStart, setCustomStart, customEnd, setCustomEnd, getDateRange, ready } = dateRange;
  const [isApplyingCustom, setIsApplyingCustom] = useState(false);
  const {
    stats,
    revenue,
    expenses,
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
    "overview" | "analytics" | "users" | "orders" | "stock" | "expenses" | "vendors" | "quotations"
  >("overview");
  // Profit is hidden until the eye is pressed, every time the page opens.
  const [showProfit, setShowProfit] = useState(false);
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

  // Range resolution lives in useDateRange only — useDashboard used to repeat
  // the season maths, which meant two places to keep in step.
  //
  // This must sit ABOVE the early returns below. It previously sat after them,
  // so on the first render (userRole still loading) the hook was never
  // registered, and the data fetch only fired on a later render — which is why
  // the season dropdown could show one season while the tiles showed another.
  useEffect(() => {
    if (!ready) return;
    if (range !== "custom") {
      fetchDashboardData(getDateRange());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ready]);

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

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



  // Apply custom range (start/end) when user clicks Apply
  const applyCustomRange = () => {
    setIsApplyingCustom(true);
    fetchDashboardData(getDateRange()).finally(() =>
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
      {
        key: "vendors",
        label: "Vendors",
      },
      {
        key: "quotations",
        label: "Quotations",
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
      {/* Full width with a slim gutter: this page is mostly wide tables, and
          `container` capped it at 1280-1536px with 24px either side. */}
      <div className="dashboard-embed w-full px-2 sm:px-4 lg:px-5">
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
                  <DateRangeFilter
                    range={range}
                    setRange={setRange}
                    customStart={customStart}
                    setCustomStart={setCustomStart}
                    customEnd={customEnd}
                    setCustomEnd={setCustomEnd}
                    onApply={applyCustomRange}
                    isApplying={isApplyingCustom}
                  />

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
              {/* Stats Grid. Total Revenue and Expected Revenue moved here
                  from Analytics (lib/revenueStages); the old Revenue tile
                  showed the same figure as Total Revenue and is gone. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Orders, users, money received and profit, one tile. Rows
                    rather than a 2x2 grid: with four tiles to a desktop line
                    a tile is ~250px wide, and a lakh figure needs the width. */}
                <div className="card">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-text/60">Orders &amp; Payments</p>
                    <div className="bg-primary-orange/10 p-2.5 rounded-full">
                      <ShoppingCart className="w-5 h-5 text-primary-orange" />
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <button
                      type="button"
                      onClick={() => navigate("/orders")}
                      className="w-full flex items-baseline justify-between gap-2 hover:text-primary-orange"
                    >
                      <span className="text-text/60">Total orders</span>
                      <span className="text-lg font-bold tabular-nums">{stats.totalOrders}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/users")}
                      className="w-full flex items-baseline justify-between gap-2 hover:text-primary-orange"
                    >
                      <span className="text-text/60 flex items-center gap-1">
                        Total users
                      </span>
                      <span className="text-lg font-bold tabular-nums">{stats.totalUsers}</span>
                    </button>
                    <div
                      className="pt-2 border-t border-card-border/10"
                      title="Payments recorded on every order that is not cancelled. Amounts are already net of discount."
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text/60 flex items-center gap-1">
                          Amt Received
                        </span>
                        <span className="text-lg font-bold tabular-nums">₹{stats.amountReceived.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-text/50 text-right">
                        Discount given: ₹{stats.discountGiven.toFixed(2)}
                      </p>
                    </div>
                    {/* Profit stays hidden until the eye is pressed, so it is
                        not on show to whoever is standing behind the screen. */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-card-border/10">
                      <span className="text-text/60 flex items-center gap-1.5">
                        Profit
                        <button
                          type="button"
                          onClick={() => setShowProfit((v) => !v)}
                          className="p-1 rounded-full hover:bg-green-500/10"
                          aria-label={showProfit ? "Hide profit" : "Show profit"}
                          title={showProfit ? "Hide profit" : "Show profit"}
                        >
                          {showProfit ? (
                            <EyeOff className="w-4 h-4 text-green-600" />
                          ) : (
                            <Eye className="w-4 h-4 text-green-600" />
                          )}
                        </button>
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {showProfit ? `₹${stats.totalProfit.toFixed(2)}` : "₹ ••••••"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Revenue */}
                <div className="card" title="Shipped and Delivered orders only, after discount.">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-text/60">Total Revenue</p>
                      <h3 className="text-2xl font-bold">₹{revenue.totalRevenue.toFixed(2)}</h3>
                      <p className="text-xs text-text/50">
                        Shipped &amp; delivered · Avg order ₹{revenue.averageOrderValue.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-primary-red/10 p-2.5 rounded-full">
                      <DollarSign className="w-5 h-5 text-primary-red" />
                    </div>
                  </div>
                  <dl className="mt-2 pt-2 border-t border-card-border/10 space-y-0.5 text-xs text-text/70">
                    {revenue.revenueByStage.map((s) => (
                      <div key={s.stage} className="flex justify-between gap-2">
                        <dt>
                          {s.stage} <span className="text-text/50">({s.orders})</span>
                        </dt>
                        <dd className="tabular-nums">₹{s.amount.toFixed(2)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-2 pt-1 text-green-700 dark:text-green-400">
                      <dt>Payment received on these</dt>
                      <dd className="tabular-nums">₹{revenue.amountReceived.toFixed(2)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Expected Revenue */}
                <div
                  className="card"
                  title="Every order not yet shipped -- enquiries, confirmed and packing -- after discount. Cancelled orders are not counted. An order moves into Total Revenue when it ships."
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-text/60">Expected Revenue</p>
                      <h3 className="text-2xl font-bold">₹{revenue.expectedRevenue.toFixed(2)}</h3>
                      <p className="text-xs text-text/50">Not yet shipped</p>
                    </div>
                    <div className="bg-primary-yellow/10 p-2.5 rounded-full">
                      <TrendingUp className="w-5 h-5 text-primary-yellow" />
                    </div>
                  </div>
                  <dl className="mt-2 pt-2 border-t border-card-border/10 space-y-0.5 text-xs text-text/70">
                    {revenue.expectedByStage.map((s) => (
                      <div key={s.stage} className="flex justify-between gap-2">
                        <dt>
                          {s.stage} <span className="text-text/50">({s.orders})</span>
                        </dt>
                        <dd className="tabular-nums">₹{s.amount.toFixed(2)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Expenses: total, by person, by type */}
                <div className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-text/60">Expenses</p>
                      <h3 className="text-2xl font-bold">₹{expenses.total.toFixed(2)}</h3>
                      <p className="text-xs text-text/50">All but credits</p>
                    </div>
                    <div className="bg-primary-red/10 p-2.5 rounded-full">
                      <Wallet className="w-5 h-5 text-primary-red" />
                    </div>
                  </div>
                  {expenses.byUser.length + expenses.byType.length === 0 ? (
                    <p className="mt-2 pt-2 border-t border-card-border/10 text-xs text-text/50">
                      No expenses in this period
                    </p>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-card-border/10 grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 text-xs text-text/70">
                      <dl className="space-y-0.5 min-w-0">
                        <dt className="font-semibold text-text/60 mb-0.5">By person</dt>
                        {expenses.byUser.map((u) => (
                          <div key={u.name} className="flex justify-between gap-2">
                            <dd className="truncate" title={u.name}>{u.name}</dd>
                            <dd className="tabular-nums">₹{u.amount.toFixed(0)}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className="space-y-0.5 min-w-0">
                        <dt className="font-semibold text-text/60 mb-0.5">By type</dt>
                        {expenses.byType.map((t) => (
                          <div key={t.type} className="flex justify-between gap-2">
                            <dd className="capitalize truncate">{t.type}</dd>
                            <dd className="tabular-nums">₹{t.amount.toFixed(0)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              </div>

              {/* Charts + Recent / Users column */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Sales Overview (wide) */}
                <div className="lg:col-span-2 flex flex-col">
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
                    </div>
                  ) : (
                    <ExpandableChart title="Sales Overview" containerHeight="flex-1 min-h-[300px]">
                      <Line
                        data={salesData}
                        options={{
                          responsive: true,
                          plugins: { legend: { display: false } },
                          scales: { y: { beginAtZero: true } },
                        }}
                      />
                    </ExpandableChart>
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
                <div className="lg:col-span-3 mt-8">
                  {topSkusChart.labels.length === 0 ? (
                    <div className="text-text/60 text-sm">
                      No sales data for selected range
                    </div>
                  ) : (
                    <ExpandableChart title="Top SKUs by Revenue">
                      <Bar
                        data={topSkusChart}
                        options={{
                          responsive: true,
                          plugins: { legend: { display: false } },
                          scales: { y: { beginAtZero: true } },
                        }}
                      />
                    </ExpandableChart>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Analytics tab */}
          {activeTab === "analytics" && (
            <div className="pt-2">
              <Analytics dateRange={dateRange} />
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
          {/* Users tab */}
          {activeTab === "users" && (
            <div className="pt-2">
              <UserList />
            </div>
          )}

          {/* Vendors tab */}
          {activeTab === "vendors" && (
            <div className="pt-2">
              <Vendors />
            </div>
          )}

          {/* Quotations tab */}
          {activeTab === "quotations" && (
            <div className="pt-2">
              <QuotationsList />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
