import { useState, useEffect, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { attachPackDetails } from "../lib/orderItems";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";
import { ExpandableChart } from "../components/ExpandableChart";
import { ExpandablePanel } from "../components/ExpandablePanel";
import { useDateRange } from "../hooks/useDateRange";
import { useSeasons } from "../context/SeasonContext";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { ReferredOrdersModal } from "../components/ReferredOrdersModal";
import { buildReferrals, type Referrer } from "../lib/referrals";
import { NOT_RECORDED, normalisePlace, resolveOrderDistricts } from "../lib/districtResolve";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AnalyticsData {
  // `counts` is the number of orders behind each place, alongside the value.
  citySales: { labels: string[]; data: number[]; counts?: number[] };
  districtSales: { labels: string[]; data: number[]; counts?: number[] };
  stateSales: { labels: string[]; data: number[]; counts?: number[] };
  productSales: { labels: string[]; quantities: number[]; revenue: number[]; counts: number[] };
  monthlyRevenue: { labels: string[]; data: number[] };
  // Total Revenue and Expected Revenue moved to the Dashboard's overview
  // tiles; see lib/revenueStages.
  stats: {
    availableStockValue: number;
    /** The same stock at this season's selling price. */
    availableSaleValue: number;
  };
  stockList?: {
    id: string;
    name: string;
    product_code?: string;
    stock: number;
    apr: number;
    value: number;
    saleValue: number;
  }[];
  referralList?: Referrer[];
  referralTotal?: number;
}

/**
 * What the location, product and monthly charts count.
 *
 * This used to be shipped/dispatched/delivered only, which meant every
 * confirmed order still being packed counted for nothing -- and in a season
 * where most orders are confirmed weeks before they move, the location charts
 * were empty for reasons that had nothing to do with geography.
 *
 * An order is a sale once it has been confirmed: that is the point stock is
 * committed and the business has agreed to supply it.
 *
 * "payment completed" is kept for orders placed before payment became its own
 * field; those rows were migrated to Order Confirmed, but a stale cache or an
 * un-migrated environment should not drop them from the totals.
 */
const COMPLETED_STATUSES = [
  "order confirmed",
  "packing",
  "shipped",
  "dispatched",
  "delivered",
  "payment completed",
];

const rupees = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * One chart's rows, largest first by `sortBy`, with every figure kept against
 * its label -- the bars, the tooltip and the records view all read the same
 * row, so an amount can never be shown against another place's order count.
 */
function buildRows(
  labels: string[],
  figures: { sales: number[]; orders: number[]; quantity?: number[] },
  sortBy: "sales" | "quantity" = "sales",
  limit = 100
) {
  return labels
    .map((label, i) => ({
      label,
      sales: Number(figures.sales[i] || 0),
      orders: Number(figures.orders[i] || 0),
      quantity: Number(figures.quantity?.[i] || 0),
    }))
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, limit);
}

type ChartRow = ReturnType<typeof buildRows>[number];

/**
 * A bar for the money (or quantity) and a bar for the number of orders, each
 * on its own axis -- ₹4,00,000 and 120 orders cannot share one scale -- with
 * both in the tooltip. Orders sits on the right so the left axis still reads
 * as the chart's main figure.
 */
function amountAndOrdersChart(
  rows: ChartRow[],
  color: string,
  metric: "sales" | "quantity" = "sales"
) {
  const primaryLabel = metric === "sales" ? "Sales (₹)" : "Quantity sold";
  return {
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: primaryLabel,
          data: rows.map((r) => r[metric]),
          backgroundColor: color,
          yAxisID: "y",
        },
        {
          label: "Orders",
          data: rows.map((r) => r.orders),
          backgroundColor: "rgba(120, 120, 120, 0.45)",
          yAxisID: "orders",
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      // Hovering a place shows its every figure, not only the bar under the
      // pointer.
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { display: true, position: "bottom" as const },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<"bar">) => {
              const row = rows[ctx.dataIndex];
              if (ctx.dataset.yAxisID === "orders") return `Orders: ${row.orders}`;
              return metric === "sales"
                ? `Sales: ${rupees(row.sales)}`
                : `Quantity sold: ${row.quantity.toLocaleString("en-IN")}`;
            },
            // A product's other figure, so either view answers both questions.
            afterBody: (items: TooltipItem<"bar">[]) => {
              const row = rows[items[0]?.dataIndex ?? -1];
              if (!row || !row.quantity) return [];
              return metric === "sales"
                ? [`Quantity sold: ${row.quantity.toLocaleString("en-IN")}`]
                : [`Sales: ${rupees(row.sales)}`];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          position: "left" as const,
          title: { display: true, text: primaryLabel },
        },
        orders: {
          beginAtZero: true,
          position: "right" as const,
          grid: { drawOnChartArea: false },
          ticks: { precision: 0 },
          title: { display: true, text: "Orders" },
        },
      },
    },
  };
}

/** The records view and its Excel export: the place, its sales and its orders. */
function placeExportRows(rows: ChartRow[], placeHeading: string) {
  return rows.map((r) => ({
    [placeHeading]: r.label,
    "Sales (₹)": r.sales,
    Orders: r.orders,
  }));
}

interface AnalyticsProps {
  /**
   * The Dashboard's own range. Inside the Dashboard this tab used to keep a
   * range of its own, which reset to the live season every time the tab was
   * opened -- so picking a season on Overview and switching to Analytics
   * quietly showed a different season. Passing the Dashboard's state in keeps
   * one season across the tabs; the standalone /analytics route has none and
   * keeps its own.
   */
  dateRange?: ReturnType<typeof useDateRange>;
}

export function Analytics({ dateRange }: AnalyticsProps = {}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const { userRole } = useAuth();
  const { activeSeason } = useSeasons();

  // Hooks cannot be called conditionally, so the local range always exists
  // and is simply ignored when the Dashboard supplies one.
  const ownDateRange = useDateRange();
  const { range, setRange, customStart, setCustomStart, customEnd, setCustomEnd, getDateRange, ready } =
    dateRange ?? ownDateRange;
  const [isApplying, setIsApplying] = useState(false);

  // UI state for Stock & Referral tables
  const [stockSearch, setStockSearch] = useState("");
  const [stockSortField, setStockSortField] = useState<"name" | "stock" | "value">("name");
  const [stockSortDir, setStockSortDir] = useState<"asc" | "desc">("asc");

  const [refSearch, setRefSearch] = useState("");
  const [refSortField, setRefSortField] =
    useState<"name" | "ordersCount" | "totalValue" | "bonus">("ordersCount");
  const [refSortDir, setRefSortDir] = useState<"asc" | "desc">("desc");
  /** The referrer whose orders are open in the popup. */
  const [refOpen, setRefOpen] = useState<Referrer | null>(null);
  /** What Top Products ranks by. Sales amount unless switched. */
  const [productMetric, setProductMetric] = useState<"sales" | "quantity">("sales");

  // See Orders.tsx: do not fetch until the season list has settled.
  useEffect(() => {
    if (!ready) return;
    if (range !== "custom") {
      handleFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ready]);

  const handleFetch = async () => {
    const { startDate, endDate, seasonId } = getDateRange();
    await fetchAnalyticsData(startDate, endDate, seasonId);
  };

  const handleApplyCustom = async () => {
    setIsApplying(true);
    await handleFetch();
    setIsApplying(false);
  };

  const fetchAnalyticsData = async (
    startDate: Date,
    endDate: Date,
    seasonId: string | null = null
  ) => {
    try {
      setLoading(true);

      let ordersQuery = supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items (
            *,
            product:products (
              id,name,product_code
            ),
            pack:combo_packs ( id, name, pack_code )
          )
        `
        );

      // season_id is exact; dates are a fallback for rolling presets.
      if (seasonId) {
        ordersQuery = ordersQuery.eq("season_id", seasonId);
      } else {
        ordersQuery = ordersQuery
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());
      }

      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;
      // Otherwise every family pack line lands in the "Unknown" bucket.
      attachPackDetails((orders || []) as any[]);

      // Stock valuation is per-season. Cost lives in the admin-only costs
      // table, so it is fetched separately and merged.
      const valuationSeasonId = seasonId ?? activeSeason?.id ?? null;

      const [catalogRes, costsRes] = await Promise.all([
        supabase
          .from("season_catalog")
          .select("id,name,product_code,stock,offer_price,product_type,is_active")
          .eq("season_id", valuationSeasonId ?? "")
          .order("order", { nullsFirst: false })
          .order("name", { ascending: true }),
        supabase
          .from("product_season_costs")
          .select("product_id, apr")
          .eq("season_id", valuationSeasonId ?? ""),
      ]);

      if (catalogRes.error) throw catalogRes.error;
      if (costsRes.error) throw costsRes.error;

      const aprByProduct = new Map(
        (costsRes.data || []).map((c: any) => [c.product_id, c.apr])
      );
      const products = (catalogRes.data || []).map((p: any) => ({
        ...p,
        apr: aprByProduct.get(p.id) ?? 0,
      }));

      // aggregate maps
      const cityMap: Record<string, number> = {};
      const districtMap: Record<string, number> = {};
      const stateMap: Record<string, number> = {};
      const cityCount: Record<string, number> = {};
      const districtCount: Record<string, number> = {};
      const stateCount: Record<string, number> = {};
      const productMap: Record<string, { qty: number; revenue: number; orders: number }> = {};

      // Sales are counted at what the customer pays, after any discount --
      // the same figure the dashboard reports as revenue.
      const netAmount = (order: any) =>
        Math.max(Number(order.total_amount || 0) - Number(order.discount_amt || 0), 0);

      // Orders with no district on them are placed from their PIN code or
      // city (lib/districtResolve) rather than piled into one "Unknown" bar.
      // Resolved across every order, so a cancelled order with a district
      // still teaches the chart where its PIN code is.
      const districtOf = await resolveOrderDistricts(orders || []);

      (orders || []).forEach((order: any) => {
        const status = (order.status || "").toString().toLowerCase();
        if (!COMPLETED_STATUSES.includes(status)) return;

        const amt = netAmount(order);
        const city = normalisePlace(order.city);
        // Spelled as the districts table spells it ("YSR Kadapa"), or title
        // case where the table does not know it.
        const district = districtOf.get(order.id) ?? NOT_RECORDED;
        const state = normalisePlace(order.state);

        cityMap[city] = (cityMap[city] || 0) + amt;
        districtMap[district] = (districtMap[district] || 0) + amt;
        stateMap[state] = (stateMap[state] || 0) + amt;

        // Order counts per place, so a chart can answer "how many orders"
        // and not only "how much money".
        cityCount[city] = (cityCount[city] || 0) + 1;
        districtCount[district] = (districtCount[district] || 0) + 1;
        stateCount[state] = (stateCount[state] || 0) + 1;
       
        // A product on two lines of one order is still one order.
        const productsInOrder = new Set<string>();
        (order.items || []).forEach((it: any) => {
          const name = it.product?.name || "Unknown";
          if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0, orders: 0 };
          productMap[name].qty += Number(it.quantity || 0);
          productMap[name].revenue += Number(it.total_price || 0);
          productsInOrder.add(name);
        });
        productsInOrder.forEach((name) => (productMap[name].orders += 1));
      });

      // monthly revenue
      const monthlyData: Record<string, number> = {};
      (orders || []).forEach((order: any) => {
        const status = (order.status || "").toString().toLowerCase();
        if (!COMPLETED_STATUSES.includes(status)) return;
        const month = format(new Date(order.created_at), "MMM yyyy");
        monthlyData[month] = (monthlyData[month] || 0) + netAmount(order);
      });


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
              // What the same stock fetches at this season's selling price.
              saleValue: Number(p.offer_price || 0) * stock,
            };
          }) || [];
      const totalStockValue = stockList.reduce((s: number, p: any) => s + p.value, 0);
      const totalSaleValue = stockList.reduce((s: number, p: any) => s + p.saleValue, 0);

      // Grouped on the referrer's last ten digits, named where the number is
      // a customer's. This used to match the typed text exactly against a
      // `profiles` table, so "+91 98…" and "98…" were two referrers and
      // hardly anyone got a name.
      const referralList = await buildReferrals(orders || []);

      const referralTotal = referralList.reduce((s, r) => s + r.bonus, 0);

      setData({
        citySales: {
          labels: Object.keys(cityMap),
          data: Object.values(cityMap),
          counts: Object.keys(cityMap).map((k) => cityCount[k] || 0),
        },
        districtSales: {
          labels: Object.keys(districtMap),
          data: Object.values(districtMap),
          counts: Object.keys(districtMap).map((k) => districtCount[k] || 0),
        },
        stateSales: {
          labels: Object.keys(stateMap),
          data: Object.values(stateMap),
          counts: Object.keys(stateMap).map((k) => stateCount[k] || 0),
        },
        productSales: {
          labels: Object.keys(productMap),
          quantities: Object.values(productMap).map((p) => p.qty),
          revenue: Object.values(productMap).map((p) => p.revenue),
          counts: Object.values(productMap).map((p) => p.orders),
        },
        monthlyRevenue: { labels: Object.keys(monthlyData), data: Object.values(monthlyData) },
        stats: {
          availableStockValue: totalStockValue,
          availableSaleValue: totalSaleValue,
        },
        stockList,
        referralList,
        referralTotal,
      });
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
      `${r.name || ""} ${r.phone} ${r.phoneDisplay}`.toLowerCase().includes(refSearch.toLowerCase())
    );
    const sorted = [...s].sort((a, b) => {
      const dir = refSortDir === "asc" ? 1 : -1;
      if (refSortField === "name") return ((a.name || "") > (b.name || "") ? 1 : -1) * dir;
      if (refSortField === "ordersCount") return (a.ordersCount - b.ordersCount) * dir;
      if (refSortField === "totalValue") return (a.totalValue - b.totalValue) * dir;
      return (a.bonus - b.bonus) * dir;
    });
    return sorted;
  }, [data?.referralList, refSearch, refSortField, refSortDir]);

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

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

  // Build chart payloads (sorted, top 100). The records views are not
  // trimmed: they are where every place is listed.
  const placeRows = (place: AnalyticsData["stateSales"]) =>
    buildRows(
      place.labels,
      { sales: place.data, orders: place.counts || [] },
      "sales",
      Number.MAX_SAFE_INTEGER
    );
  const stateRows = placeRows(data.stateSales);
  const districtRows = placeRows(data.districtSales);
  const cityRows = placeRows(data.citySales);
  const productRows = buildRows(
    data.productSales.labels,
    {
      sales: data.productSales.revenue,
      orders: data.productSales.counts,
      quantity: data.productSales.quantities,
    },
    productMetric === "sales" ? "sales" : "quantity",
    Number.MAX_SAFE_INTEGER
  );

  const stateChart = amountAndOrdersChart(stateRows.slice(0, 100), "#FF5722");
  const districtChart = amountAndOrdersChart(districtRows.slice(0, 100), "#2196F3");
  const cityChart = amountAndOrdersChart(cityRows.slice(0, 100), "#4CAF50");
  const topProducts = amountAndOrdersChart(
    productRows.slice(0, 100),
    "#FFC107",
    productMetric === "sales" ? "sales" : "quantity"
  );

  const stateViewRows = placeExportRows(stateRows, "State");
  const districtViewRows = placeExportRows(districtRows, "District");
  const cityViewRows = placeExportRows(cityRows, "City");
  const topProductViewRows = productRows.map((r) => ({
    Product: r.label,
    "Sales (₹)": r.sales,
    "Quantity sold": r.quantity,
    Orders: r.orders,
  }));

  return (
    <div className="min-h-screen pt-8 pb-12">
      <ReferredOrdersModal referrer={refOpen} onClose={() => setRefOpen(null)} />
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="font-heading text-4xl">Analytics Dashboard</h1>
          <DateRangeFilter 
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
            onApply={handleApplyCustom}
            isApplying={isApplying}
          />
        </div>

        {/* No summary tiles: orders, products and the stock value all repeat
            figures on the Dashboard overview, where the stock value now is. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Available Stock and Referral Bonuses each take a full row: they
              are tables, and half a page cut their columns short. The charts
              below stay two to a row. */}
          <div className="lg:col-span-2">
          <ExpandablePanel
            title="Available Stock"
            // The whole stock, whatever the search below: how many products,
            // and what they are worth at cost and at the selling price.
            summary={
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <span className="px-2.5 py-1 rounded-full bg-background/60 border border-card-border/20">
                  <span className="text-text/60">Products </span>
                  <strong className="tabular-nums">{(data.stockList || []).length}</strong>
                </span>
                <span
                  className="px-2.5 py-1 rounded-full bg-primary-orange/10 text-primary-orange"
                  title="Available qty × APR (cost), all products"
                >
                  <span className="opacity-80">At APR </span>
                  <strong className="tabular-nums">₹{data.stats.availableStockValue.toFixed(2)}</strong>
                </span>
                <span
                  className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-700 dark:text-green-400"
                  title="Available qty × this season's selling price, all products"
                >
                  <span className="opacity-80">At selling price </span>
                  <strong className="tabular-nums">₹{data.stats.availableSaleValue.toFixed(2)}</strong>
                </span>
              </div>
            }
          >
            {(expanded) => (
              <>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                placeholder="Search product or code..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="w-full sm:flex-1 p-2 border rounded bg-white"
              />
              <div className="flex gap-2">
                <select
                  value={stockSortField}
                  onChange={(e) => setStockSortField(e.target.value as any)}
                  className="flex-1 sm:flex-none p-2 border rounded"
                >
                  <option value="name">Name</option>
                  <option value="stock">Available Qty</option>
                  <option value="value">Value</option>
                </select>
                <button
                  onClick={() => setStockSortDir((s) => (s === "asc" ? "desc" : "asc"))}
                  className="px-3 py-2 border rounded whitespace-nowrap"
                >
                  {stockSortDir === "asc" ? "Asc" : "Desc"}
                </button>
              </div>
            </div>

            <div className={`overflow-x-auto ${expanded ? "flex-1 min-h-0 flex flex-col" : ""}`}>
              <div className={expanded ? "flex-1 min-h-0 overflow-y-auto" : "max-h-64 overflow-y-auto"}>
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-[1] bg-card">
                    <tr className="bg-card/50 text-left">
                      <th className="p-3">Code</th>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Available Qty</th>
                      <th className="p-3 text-right">APR</th>
                      <th className="p-3 text-right">Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.length > 0 ? (
                      filteredStock.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-3 font-mono text-sm whitespace-nowrap">{p.product_code || "-"}</td>
                          <td className="p-3">{p.name}</td>
                          {/* Beside the name, so a low line is seen as the
                              product is read, not at the far end of the row. */}
                          <td className="p-3 text-center">
                            {p.stock < 20 ? (
                              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">Low</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs">OK</span>
                            )}
                          </td>
                          <td className={`p-3 text-right ${p.stock < 20 ? "text-red-600 font-bold" : ""}`}>{p.stock}</td>
                          <td className="p-3 text-right">₹{p.apr?.toFixed(2)}</td>
                          <td className="p-3 text-right">₹{p.value.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-text/60">No products found</td>
                      </tr>
                    )}
                  </tbody>
                  {/* Totals follow the search, as the referral table's do; the
                      figures beside the title are always the whole stock. */}
                  <tfoot>
                    <tr className="border-t">
                      <td className="p-3 font-bold" colSpan={3}>
                        Total{" "}
                        <span className="font-normal text-text/60">
                          ({filteredStock.length} product{filteredStock.length === 1 ? "" : "s"})
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {filteredStock.reduce((s, p) => s + p.stock, 0)}
                      </td>
                      <td />
                      <td className="p-3 text-right font-bold tabular-nums">
                        ₹{filteredStock.reduce((s, p) => s + p.value, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            </>
            )}
          </ExpandablePanel>
          </div>

          {/* Referral Bonuses with search, sort and S.No */}
          <div className="lg:col-span-2">
          <ExpandablePanel title="Referral Bonuses">
            {(expanded) => (
              <>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                placeholder="Search name / phone..."
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                className="w-full sm:flex-1 p-2 border rounded bg-white"
              />
              <div className="flex gap-2">
                <select
                  value={refSortField}
                  onChange={(e) => setRefSortField(e.target.value as any)}
                  className="flex-1 sm:flex-none p-2 border rounded"
                >
                  <option value="ordersCount">Orders Referred</option>
                  <option value="totalValue">Orders Value</option>
                  <option value="bonus">Referral Bonus</option>
                  <option value="name">Name</option>
                </select>
                <button
                  onClick={() => setRefSortDir((s) => (s === "asc" ? "desc" : "asc"))}
                  className="px-3 py-2 border rounded whitespace-nowrap"
                >
                  {refSortDir === "asc" ? "Asc" : "Desc"}
                </button>
              </div>
            </div>

            <div className={`overflow-x-auto ${expanded ? "flex-1 min-h-0 flex flex-col" : ""}`}>
              <div className={expanded ? "flex-1 min-h-0 overflow-y-auto" : "max-h-64 overflow-y-auto"}>
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-[1] bg-card">
                    <tr className="bg-card/50 text-left">
                      <th className="p-3">S.No</th>
                      <th className="p-3">Referred by</th>
                      <th className="p-3 text-center">Orders Referred</th>
                      <th className="p-3 text-right">Orders Value (₹)</th>
                      <th className="p-3 text-right">Referral Bonus (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReferral.length > 0 ? (
                      filteredReferral.map((r, idx) => (
                        <tr key={r.phone} className="border-t">
                          <td className="p-3">{idx + 1}</td>
                          <td className="p-3">
                            {/* Opens the orders this person referred. */}
                            <button
                              type="button"
                              onClick={() => setRefOpen(r)}
                              className="text-left hover:text-primary-orange hover:underline"
                              title="Show the orders referred"
                            >
                              <span className="font-medium">{r.name || r.phoneDisplay}</span>
                              {r.name && <div className="text-xs text-text/60">{r.phoneDisplay}</div>}
                            </button>
                          </td>
                          <td className="p-3 text-center">{r.ordersCount}</td>
                          <td className="p-3 text-right tabular-nums">₹{r.totalValue.toFixed(2)}</td>
                          <td className="p-3 text-right tabular-nums">₹{r.bonus.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-text/60">No referrals found</td>
                      </tr>
                    )}
                  </tbody>
                  {/* Totals follow the search, so a filtered list adds up on its own. */}
                  <tfoot>
                    <tr className="border-t">
                      <td className="p-3 font-bold" colSpan={2}>Total</td>
                      <td className="p-3 text-center font-bold">{filteredReferral.reduce((s, r) => s + r.ordersCount, 0)}</td>
                      <td className="p-3 text-right font-bold tabular-nums">₹{filteredReferral.reduce((s, r) => s + r.totalValue, 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold tabular-nums">₹{filteredReferral.reduce((s, r) => s + r.bonus, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            </>
            )}
          </ExpandablePanel>
          </div>

          {/* State-wise Sales */}
          {/* State-wise Sales */}
          <ExpandableChart
            title="State-wise Sales"
            viewData={stateViewRows}
            exportFileName="state-wise-sales.xlsx"
          >
            <Bar data={stateChart.data} options={stateChart.options} />
          </ExpandableChart>

          {/* District-wise Sales. Orders with no district are placed from
              their PIN code or city -- see lib/districtResolve. */}
          <ExpandableChart
            title="District-wise Sales"
            viewData={districtViewRows}
            exportFileName="district-wise-sales.xlsx"
          >
            <Bar data={districtChart.data} options={districtChart.options} />
          </ExpandableChart>

          {/* City-wise Sales */}
          <ExpandableChart
            title="City-wise Sales"
            viewData={cityViewRows}
            exportFileName="city-wise-sales.xlsx"
          >
            <Bar data={cityChart.data} options={cityChart.options} />
          </ExpandableChart>

          {/* Top Products, ranked by sales amount (the default) or by the
              quantity sold. Orders is beside either. */}
          <ExpandableChart
            title={productMetric === "sales" ? "Top Products (Sales)" : "Top Products (Quantity)"}
            viewData={topProductViewRows}
            exportFileName="top-products-sales.xlsx"
            actions={
              <div
                role="radiogroup"
                aria-label="Rank top products by"
                className="flex rounded-full border border-card-border/30 p-0.5 text-xs"
              >
                {(
                  [
                    ["sales", "Sales ₹"],
                    ["quantity", "Quantity"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={productMetric === value}
                    onClick={() => setProductMetric(value)}
                    className={`px-3 py-1 rounded-full transition-colors whitespace-nowrap ${
                      productMetric === value
                        ? "bg-primary-orange text-white"
                        : "text-text/70 hover:bg-black/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <Bar data={topProducts.data} options={topProducts.options} />
          </ExpandableChart>
        </div>
      </div>
    </div>
  );
}
