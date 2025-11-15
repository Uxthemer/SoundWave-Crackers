import { useState, useEffect } from "react";
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
import { Line, Doughnut } from "react-chartjs-2";
import { useDashboard } from "../hooks/useDashboard";
import { useProducts } from "../hooks/useProducts";
import { useAuth } from "../context/AuthContext";
import {
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
  DashboardRange,
} from "../config/dashboardConfig";

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
  const { stats, salesData, categoryData, loading, fetchDashboardData } =
    useDashboard();
  const { exportProductsToExcel, importProductsFromExcel } = useProducts();
  const [importStatus, setImportStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [importError, setImportError] = useState("");
  // quick group switch state
  const [quickTab, setQuickTab] = useState<
    "dashboard" | "orders" | "stock" | "analytics" | "expenses" | null
  >("dashboard");
  const isAdmin = ["admin", "superadmin"].includes(userRole?.name || "");

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

  // Fetch initial data and when dateRange changes
  useEffect(() => {
    fetchDashboardData(dateRange);
  }, [dateRange]);

  // if you render buttons for ranges use DASHBOARD_RANGES to build them
  // Example (where you currently render the week/month toggles):
  // {DASHBOARD_RANGES.map(r => (
  //   <button key={r} onClick={() => { setDateRange(r); fetchDashboardData(r); }}>{r}</button>
  // ))}

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

  const rendergroupSwitch = () => {
    const buttons = [
      {
        key: "dashboard",
        label: "Dashboard",
        to: "/dashboard",
      },
      {
        key: "orders",
        label: "Manage Orders",
        to: "/orders",
      },
      {
        key: "stock",
        label: "Stock Management",
        to: "/stock",
      },
      {
        key: "analytics",
        label: "Analytics",
        to: "/analytics",
      },
      {
        key: "expenses",
        label: "Expense Tracking",
        to: "/expenses",
      },
    ];
    return buttons.map((btn: any) => {
      const active = quickTab === btn.key;
      return (
        <button
          key={btn.key}
          onClick={() => {
            setQuickTab(btn.key);
            navigate(btn.to);
          }}
          className={`px-4 py-2 rounded-lg transition-colors ${
            active ? "bg-primary-orange text-white" : "bg-card hover:bg-card/50"
          }`}
        >
          {btn.label}
        </button>
      );
    });
  };

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="mb-6">
          <h1 className="font-heading text-4xl mb-2">Dashboard</h1>
          <p className="text-text/60">
            Welcome to your SoundWave Crackers dashboard
          </p>

          {/* Quick group switch (moved to top under title) */}
          <div className="mt-4 flex flex-wrap gap-2">{rendergroupSwitch()}</div>
          {/* end quick group switch */}
        </div>

        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div />

          <div className="flex flex-wrap gap-4">
            <select
              value={dateRange}
              onChange={(e) =>
                handleDateRangeChange(e.target.value as DashboardRange)
              }
              className="bg-card border border-card-border/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary-orange"
            >
              {DASHBOARD_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r === "week"
                    ? "This Week"
                    : r === "month"
                    ? "This Month"
                    : r === "year"
                    ? "This Year"
                    : r}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={exportProductsToExcel}
                className="flex items-center gap-2 bg-card border border-card-border/10 rounded-lg px-4 py-2 hover:bg-card/70 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export Products</span>
              </button>

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
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <button
            onClick={() => navigate("/orders")}
            className="card hover:border-primary-orange transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text/60">Total Orders</p>
                <h3 className="text-2xl font-bold">{stats.totalOrders}</h3>
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
              <div>
                <p className="text-text/60">Total Revenue</p>
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
              <div>
                <p className="text-text/60">Total Profit</p>
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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="card">
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
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                    },
                  },
                }}
              />
            )}
          </div>

          <div className="card">
            <h3 className="font-montserrat font-bold text-xl mb-6">
              Category Distribution
            </h3>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
              </div>
            ) : (
              <div className="aspect-square max-w-[300px] mx-auto">
                <Doughnut
                  data={categoryData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: "right",
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
