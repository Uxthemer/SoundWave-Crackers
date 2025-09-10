import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Loader2,
  TrendingUp,
  Package,
  DollarSign,
  Info,
} from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AnalyticsData {
  citySales: { labels: string[]; data: number[] };
  districtSales: { labels: string[]; data: number[] };
  stateSales: { labels: string[]; data: number[] };
  productSales: { labels: string[]; quantities: number[]; revenue: number[] };
  monthlyRevenue: { labels: string[]; data: number[] };
  stats: {
    totalRevenue: number;
    expectedRevenue: number;
    totalOrders: number;
    totalProducts: number;
    averageOrderValue: number;
    availableStockValue: number;
  };
  stockList?: {
    id: string;
    name: string;
    product_code?: string;
    stock: number;
    apr: number;
    value: number;
  }[];
  referralList?: {
    phone: string;
    name?: string | null;
    address?: string | null;
    contact?: string | null;
    ordersCount: number;
    totalValue: number;
    bonus: number;
  }[];
  referralTotal?: number;
}

const COMPLETED_STATUSES = ["shipped", "dispatched", "delivered"];
const PENDING_STATUSES = ["enquiry received", "packing", "payment completed"];

// small helper to build chart series sorted & trimmed
function buildChartFromMap(mapLabels: string[], mapData: number[], limit = 12) {
  const pairs = mapLabels.map((l, i) => ({ label: l, value: Number(mapData[i] || 0) }));
  pairs.sort((a, b) => b.value - a.value);
  const trimmed = pairs.slice(0, limit);
  return {
    labels: trimmed.map((p) => p.label),
    data: trimmed.map((p) => p.value),
  };
}

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const { userRole } = useAuth();
  const [dateRange, setDateRange] = useState<"week" | "month" | "year">("month");

  // UI state for Stock & Referral tables
  const [stockSearch, setStockSearch] = useState("");
  const [stockSortField, setStockSortField] = useState<"name" | "stock" | "value">("name");
  const [stockSortDir, setStockSortDir] = useState<"asc" | "desc">("asc");

  const [refSearch, setRefSearch] = useState("");
  const [refSortField, setRefSortField] =
    useState<"name" | "ordersCount" | "bonus">("ordersCount");
  const [refSortDir, setRefSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items (
            *,
            product:products (
              id,name,product_code
            )
          )
        `
        );
      if (ordersError) throw ordersError;

      // fetch product_type and is_active so we can exclude group products and inactive ones
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id,name,product_code,stock,apr,product_type,is_active")
        .order("name", { ascending: true });
      if (prodError) throw prodError;

      // aggregate maps
      const cityMap: Record<string, number> = {};
      const districtMap: Record<string, number> = {};
      const stateMap: Record<string, number> = {};
      const productMap: Record<string, { qty: number; revenue: number }> = {};
      
      (orders || []).forEach((order: any) => {
        const status = (order.status || "").toString().toLowerCase();
        if (!COMPLETED_STATUSES.includes(status)) return;

        const amt = Number(order.total_amount || 0);
        const city = order.city || "Unknown";
        const district = order.district || "Unknown";
        const state = order.state || "Unknown";

        cityMap[city] = (cityMap[city] || 0) + amt;
        districtMap[district] = (districtMap[district] || 0) + amt;
        stateMap[state] = (stateMap[state] || 0) + amt;
       
        (order.items || []).forEach((it: any) => {
          const name = it.product?.name || "Unknown";
          if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
          productMap[name].qty += Number(it.quantity || 0);
          productMap[name].revenue += Number(it.total_price || 0);
        });
      });

      // monthly revenue
      const monthlyData: Record<string, number> = {};
      (orders || []).forEach((order: any) => {
        const status = (order.status || "").toString().toLowerCase();
        if (!COMPLETED_STATUSES.includes(status)) return;
        const month = format(new Date(order.created_at), "MMM yyyy");
        monthlyData[month] = (monthlyData[month] || 0) + Number(order.total_amount || 0);
      });

      // stats
      const totalRevenue = Object.values(cityMap).reduce((s, v) => s + v, 0);
      const expectedRevenue = (orders || []).reduce((sum: number, order: any) => {
        return PENDING_STATUSES.includes((order.status || "").toString().toLowerCase())
          ? sum + Number(order.total_amount || 0)
          : sum;
      }, 0);
      const completedOrders = (orders || []).filter((o: any) =>
        COMPLETED_STATUSES.includes((o.status || "").toString().toLowerCase())
      );
      const averageOrderValue =
        completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

      // stock list and total stock value
      // include only active single products (ignore group product_type and inactive)
      const stockList =
        (products || [])
          .filter((p: any) => (p.product_type || "").toString().toLowerCase() !== "group" && !!p.is_active)
          .map((p: any) => {
            const apr = Number(p.apr || 0);
            const stock = Number(p.stock || 0);
            const value = apr * stock;
            return {
              id: p.id,
              name: p.name,
              product_code: p.product_code,
              stock,
              apr,
              value,
            };
          }) || [];
      const totalStockValue = stockList.reduce((s: number, p: any) => s + p.value, 0);

      // referral aggregation
      const referralMap: Record<string, { ordersCount: number; totalValue: number }> = {};
      (orders || []).forEach((o: any) => {
        const ref = (o.referred_by || "").toString().trim();
        if (!ref) return;
        if (!referralMap[ref]) referralMap[ref] = { ordersCount: 0, totalValue: 0 };
        referralMap[ref].ordersCount += 1;
        referralMap[ref].totalValue += Number(o.total_amount || 0);
      });

      const referralPhones = Object.keys(referralMap);
      let referralProfiles: any[] = [];
      if (referralPhones.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name,phone,address,city,state,pincode")
          .in("phone", referralPhones);
        if (!profErr && profiles) referralProfiles = profiles as any[];
      }

      const referralList =
        referralPhones.map((phone) => {
          const agg = referralMap[phone];
          const prof = referralProfiles.find((p) => (p.phone || "").toString() === phone);
          const addressParts = prof
            ? [prof.address, prof.city, prof.state, prof.pincode].filter(Boolean).join(", ")
            : null;
          const name = prof?.full_name || null;
          const contact = prof?.phone || phone;
          const totalValue = agg.totalValue;
          const bonus = +(totalValue * 0.05);
          return {
            phone,
            name,
            address: addressParts,
            contact,
            ordersCount: agg.ordersCount,
            totalValue,
            bonus,
          };
        }) || [];

      const referralTotal = referralList.reduce((s, r) => s + r.bonus, 0);

      setData({
        citySales: { labels: Object.keys(cityMap), data: Object.values(cityMap) },
        districtSales: { labels: Object.keys(districtMap), data: Object.values(districtMap) },
        stateSales: { labels: Object.keys(stateMap), data: Object.values(stateMap) },
        productSales: {
          labels: Object.keys(productMap),
          quantities: Object.values(productMap).map((p) => p.qty),
          revenue: Object.values(productMap).map((p) => p.revenue),
        },
        monthlyRevenue: { labels: Object.keys(monthlyData), data: Object.values(monthlyData) },
        stats: {
          totalRevenue,
          expectedRevenue,
          totalOrders: (orders || []).length,
          totalProducts: new Set((orders || []).flatMap((o: any) => o.items?.map((i: any) => i.product_id) || [])).size,
          averageOrderValue,
          availableStockValue: totalStockValue,
        },
        stockList,
        referralList,
        referralTotal,
      });
      console.log("Fetched analytics data:", { data });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  // derived / filtered lists for tables with search & sort
  const filteredStock = useMemo(() => {
    if (!data?.stockList) return [];
    const s = data.stockList.filter((p) =>
      `${p.name} ${p.product_code || ""}`.toLowerCase().includes(stockSearch.toLowerCase())
    );
    const sorted = [...s].sort((a, b) => {
      const dir = stockSortDir === "asc" ? 1 : -1;
      if (stockSortField === "name") return a.name.localeCompare(b.name) * dir;
      if (stockSortField === "stock") return (a.stock - b.stock) * dir;
      return (a.value - b.value) * dir;
    });
    return sorted;
  }, [data?.stockList, stockSearch, stockSortField, stockSortDir]);

  const filteredReferral = useMemo(() => {
    if (!data?.referralList) return [];
    const s = data.referralList.filter((r) =>
      `${r.name || ""} ${r.phone} ${r.address || ""}`.toLowerCase().includes(refSearch.toLowerCase())
    );
    const sorted = [...s].sort((a, b) => {
      const dir = refSortDir === "asc" ? 1 : -1;
      if (refSortField === "name") return ((a.name || "") > (b.name || "") ? 1 : -1) * dir;
      if (refSortField === "ordersCount") return (a.ordersCount - b.ordersCount) * dir;
      return (a.bonus - b.bonus) * dir;
    });
    return sorted;
  }, [data?.referralList, refSearch, refSortField, refSortDir]);

  if (!["admin", "superadmin"].includes(userRole?.name || "")) {
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

  if (loading || !data) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  // Build chart payloads (sorted, top 12)
  const stateChart = buildChartFromMap(data.stateSales.labels, data.stateSales.data, 12);
  const districtChart = buildChartFromMap(data.districtSales.labels, data.districtSales.data, 12);
  const cityChart = buildChartFromMap(data.citySales.labels, data.citySales.data, 12);
  const topProducts = buildChartFromMap(data.productSales.labels, data.productSales.quantities, 12);

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="font-heading text-4xl">Analytics Dashboard</h1>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as "week" | "month" | "year")}
            className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-montserrat font-bold">
                  Total Revenue
                </h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-text/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-card rounded-lg shadow-lg invisible group-hover:visible text-xs">
                    Based on shipped, dispatched, and delivered orders only
                  </div>
                </div>
              </div>
              <div className="bg-primary-orange/10 p-2 rounded-full">
                <DollarSign className="w-4 h-4 text-primary-orange" />
              </div>
            </div>
            <p className="text-xl font-bold mb-1">
              ₹{data.stats.totalRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-text/60">
              Avg order: ₹{data.stats.averageOrderValue.toFixed(2)}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-montserrat font-bold">
                  Expected Revenue
                </h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-text/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-card rounded-lg shadow-lg invisible group-hover:visible text-xs">
                    Based on pending and processing orders
                  </div>
                </div>
              </div>
              <div className="bg-primary-orange/10 p-2 rounded-full">
                <DollarSign className="w-4 h-4 text-primary-orange" />
              </div>
            </div>
            <p className="text-xl font-bold mb-1">
              ₹{data.stats.expectedRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-text/60">From pending orders</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-montserrat font-bold">
                  Total Orders
                </h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-text/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-card rounded-lg shadow-lg invisible group-hover:visible text-xs">
                    Total number of orders across all statuses
                  </div>
                </div>
              </div>
              <div className="bg-primary-orange/10 p-2 rounded-full">
                <Package className="w-4 h-4 text-primary-orange" />
              </div>
            </div>
            <p className="text-xl font-bold mb-1">{data.stats.totalOrders}</p>
            <p className="text-xs text-text/60">All orders</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-montserrat font-bold">
                  Products Sold
                </h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-text/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-card rounded-lg shadow-lg invisible group-hover:visible text-xs">
                    Number of unique products sold
                  </div>
                </div>
              </div>
              <div className="bg-primary-orange/10 p-2 rounded-full">
                <Package className="w-4 h-4 text-primary-orange" />
              </div>
            </div>
            <p className="text-xl font-bold mb-1">{data.stats.totalProducts}</p>
            <p className="text-xs text-text/60">Unique products</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-montserrat font-bold">
                  Available Stock Value
                </h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-text/40 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-card rounded-lg shadow-lg invisible group-hover:visible text-xs">
                    Sum of (available stock quantity * APR price) across all products
                  </div>
                </div>
              </div>
              <div className="bg-primary-orange/10 p-2 rounded-full">
                <TrendingUp className="w-4 h-4 text-primary-orange" />
              </div>
            </div>
            <p className="text-xl font-bold mb-1">
              ₹{data.stats.availableStockValue.toFixed(2)}
            </p>
            <p className="text-xs text-text/60">Inventory value (APR)</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Available Stock (compact, inner scroll) with search & sort */}
          <motion.div className="bg-card rounded-xl p-6 col-span-1 lg:col-span-1">
            <h3 className="font-montserrat font-bold text-xl mb-4">Available Stock</h3>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Search product or code..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="flex-1 p-2 border rounded bg-white"
              />
              <select
                value={stockSortField}
                onChange={(e) => setStockSortField(e.target.value as any)}
                className="p-2 border rounded"
              >
                <option value="name">Name</option>
                <option value="stock">Available Qty</option>
                <option value="value">Value</option>
              </select>
              <button
                onClick={() => setStockSortDir((s) => (s === "asc" ? "desc" : "asc"))}
                className="px-3 py-2 border rounded"
              >
                {stockSortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-card/50 text-left">
                      <th className="p-3">S.No</th>
                      <th className="p-3">Product</th>
                      <th className="p-3">Code</th>
                      <th className="p-3 text-right">Available Qty</th>
                      <th className="p-3 text-right">APR</th>
                      <th className="p-3 text-right">Value (₹)</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.length > 0 ? (
                      filteredStock.map((p, idx) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-3">{idx + 1}</td>
                          <td className="p-3">{p.name}</td>
                          <td className="p-3">{p.product_code || "-"}</td>
                          <td className={`p-3 text-right ${p.stock < 20 ? "text-red-600 font-bold" : ""}`}>{p.stock}</td>
                          <td className="p-3 text-right">₹{p.apr?.toFixed(2)}</td>
                          <td className="p-3 text-right">₹{p.value.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            {p.stock < 20 ? (
                              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">Low</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs">OK</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-text/60">No products found</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td className="p-3 font-bold">Total</td>
                      <td />
                      <td />
                      <td />
                      <td />
                      <td className="p-3 text-right font-bold">₹{data.stats.availableStockValue.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Referral Bonuses with search, sort and S.No */}
          <motion.div className="bg-card rounded-xl p-6 col-span-1 lg:col-span-1">
            <h3 className="font-montserrat font-bold text-xl mb-4">Referral Bonuses</h3>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Search name / phone / address..."
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                className="flex-1 p-2 border rounded bg-white"
              />
              <select
                value={refSortField}
                onChange={(e) => setRefSortField(e.target.value as any)}
                className="p-2 border rounded"
              >
                <option value="ordersCount">Orders Referred</option>
                <option value="bonus">Referral Bonus</option>
                <option value="name">Name</option>
              </select>
              <button
                onClick={() => setRefSortDir((s) => (s === "asc" ? "desc" : "asc"))}
                className="px-3 py-2 border rounded"
              >
                {refSortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-card/50 text-left">
                      <th className="p-3">S.No</th>
                      <th className="p-3">User / Phone</th>
                      <th className="p-3">Address</th>
                      <th className="p-3 text-right">Contact</th>
                      <th className="p-3 text-center">Orders Referred</th>
                      <th className="p-3 text-right">Referral Bonus (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReferral.length > 0 ? (
                      filteredReferral.map((r, idx) => (
                        <tr key={r.phone} className="border-t">
                          <td className="p-3">{idx + 1}</td>
                          <td className="p-3">
                            {r.name ? r.name : r.phone}
                            <div className="text-xs text-text/60">{r.phone}</div>
                          </td>
                          <td className="p-3">{r.address || "-"}</td>
                          <td className="p-3 text-right">{r.contact || "-"}</td>
                          <td className="p-3 text-center">{r.ordersCount}</td>
                          <td className="p-3 text-right">₹{r.bonus.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-text/60">No referrals found</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td className="p-3 font-bold">Total</td>
                      <td />
                      <td />
                      <td />
                      <td className="p-3 text-center font-bold">{filteredReferral.reduce((s, r) => s + r.ordersCount, 0)}</td>
                      <td className="p-3 text-right font-bold">₹{(data.referralTotal || 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </motion.div>

          {/* State-wise Sales */}
          <motion.div className="bg-card rounded-xl p-6">
            <h3 className="font-montserrat font-bold text-xl mb-6">State-wise Sales</h3>
            <Bar
              data={{
                labels: stateChart.labels,
                datasets: [{ label: "Sales (₹)", data: stateChart.data, backgroundColor: "#FF5722" }],
              }}
              options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
            />
          </motion.div>

          {/* District-wise Sales */}
          <motion.div className="bg-card rounded-xl p-6">
            <h3 className="font-montserrat font-bold text-xl mb-6">District-wise Sales</h3>
            <Bar
              data={{
                labels: districtChart.labels,
                datasets: [{ label: "Sales (₹)", data: districtChart.data, backgroundColor: "#2196F3" }],
              }}
              options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
            />
          </motion.div>

          {/* City-wise Sales */}
          <motion.div className="bg-card rounded-xl p-6">
            <h3 className="font-montserrat font-bold text-xl mb-6">City-wise Sales</h3>
            <Bar
              data={{
                labels: cityChart.labels,
                datasets: [{ label: "Sales (₹)", data: cityChart.data, backgroundColor: "#4CAF50" }],
              }}
              options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
            />
          </motion.div>

          {/* Top Products (Quantity Sold) */}
          <motion.div className="bg-card rounded-xl p-6">
            <h3 className="font-montserrat font-bold text-xl mb-6">Top Products (Quantity Sold)</h3>
            <Bar
              data={{
                labels: topProducts.labels,
                datasets: [{ label: "Quantity Sold", data: topProducts.data, backgroundColor: "#FFC107" }],
              }}
              options={{ responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
