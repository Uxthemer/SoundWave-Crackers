import { format } from "date-fns";
import { supabase } from "./supabase";
import { attachPackDetails } from "./orderItems";
import { buildReferrals } from "./referrals";
import {
  CANCELLED_STATUS,
  REVENUE_STATUSES,
  SALE_STATUSES,
  netAmount,
  revenueSummary,
  statusOf,
} from "./revenueStages";
import { NOT_RECORDED, normalisePlace, resolveOrderDistricts } from "./districtResolve";
import type { BusinessDetails } from "./businessDetails";

/**
 * The season report: everything the Dashboard knows about one season (or one
 * date range), in one file -- revenue actual and expected, money received,
 * expenses, orders, customers, the Analytics breakdowns and the stock on hand.
 *
 * It is read fresh rather than lifted from the screen, because the screen
 * holds only what each tab happened to load, and a report that depends on
 * which tabs were opened first is not a report.
 *
 * The figures follow the Dashboard's own definitions (lib/revenueStages):
 * actual revenue is shipped and delivered; expected is everything live that
 * has not shipped; a sale, for the breakdowns, is confirmed onward; cancelled
 * orders are listed but never counted.
 *
 * The result is a list of titled tables, so the CSV and the PDF are two
 * drawings of the same thing and cannot disagree.
 */

export interface ReportColumn {
  header: string;
  /** Rupees: right-aligned, two decimals, summed where the table has a foot. */
  money?: boolean;
  /** Counts: right-aligned. */
  numeric?: boolean;
}

/** A rupee figure in a column that also holds counts (the summary's Value). */
export type MoneyCell = { money: number };

export type ReportCell = string | number | MoneyCell;

/**
 * How the PDF draws a table as a chart, from the table's own rows -- so the
 * chart and the table under it can never disagree. The CSV ignores it.
 *
 *  - "bars":   a ranking, one horizontal bar per row (top `limit`), by `value`.
 *  - "columns": a series in order (months), one column per row.
 *  - "share":  parts of a whole, as one proportion bar, by `value`.
 *  - "tally":  parts of a whole by how many rows carry each `label` (statuses).
 */
export interface ReportChart {
  type: "bars" | "columns" | "share" | "tally";
  label: number;
  value?: number;
  limit?: number;
  /** The value column is rupees (default) or a count. */
  money?: boolean;
  caption?: string;
}

export interface ReportTable {
  title: string;
  note?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  foot?: ReportCell[];
  chart?: ReportChart;
  /** Groups tables under one section heading in the PDF. */
  section?: string;
}

/** A headline figure for the PDF's first page. */
export interface ReportKpi {
  label: string;
  value: number;
  money?: boolean;
  note?: string;
  tone?: "brand" | "good" | "warn" | "bad" | "neutral";
}

export interface SeasonReport {
  /** "Season 2026" or "01 Jan 2026 – 31 Mar 2026". */
  periodLabel: string;
  generatedAt: Date;
  business: BusinessDetails;
  kpis: ReportKpi[];
  /** Money in against money owed, for the collection bar. */
  collection: { received: number; due: number; extra: number };
  tables: ReportTable[];
}

export interface ReportRange {
  startDate: Date;
  endDate: Date;
  seasonId?: string | null;
}

const LOW_STOCK = 5;

const sumBy = <T,>(list: T[], pick: (item: T) => number) =>
  list.reduce((sum, item) => sum + (Number(pick(item)) || 0), 0);

const day = (value: string | Date) => format(new Date(value), "dd MMM yyyy");

/** Rows of a place breakdown, largest sales first. */
function placeTable(
  title: string,
  heading: string,
  tally: Map<string, { orders: number; sales: number }>
): ReportTable {
  const rows = [...tally.entries()].sort((a, b) => b[1].sales - a[1].sales);
  return {
    title,
    columns: [{ header: heading }, { header: "Orders", numeric: true }, { header: "Sales", money: true }],
    rows: rows.map(([place, t]) => [place, t.orders, t.sales]),
    foot: ["Total", sumBy(rows, ([, t]) => t.orders), sumBy(rows, ([, t]) => t.sales)],
    section: "Sales analytics",
    chart: { type: "bars", label: 0, value: 2, limit: 10, caption: `Top ${heading.toLowerCase()}s by sales` },
  };
}

function addTo(
  tally: Map<string, { orders: number; sales: number }>,
  key: string,
  sales: number
) {
  const entry = tally.get(key) ?? { orders: 0, sales: 0 };
  entry.orders += 1;
  entry.sales += sales;
  tally.set(key, entry);
}

export async function buildSeasonReport(
  range: ReportRange,
  periodLabel: string,
  business: BusinessDetails,
  options: { includeProfit: boolean }
): Promise<SeasonReport> {
  const seasonId = range.seasonId ?? null;
  const startIso = range.startDate.toISOString();
  const endIso = range.endDate.toISOString();

  // ---- orders, with their lines and receipts --------------------------------
  let ordersQuery = supabase
    .from("orders")
    .select(
      `*,
       items:order_items ( *, product:products ( id, name, product_code ), pack:combo_packs ( id, name, pack_code ) ),
       payments:order_payments ( amount, method, created_at )`
    )
    .order("created_at", { ascending: true });
  ordersQuery = seasonId
    ? ordersQuery.eq("season_id", seasonId)
    : ordersQuery.gte("created_at", startIso).lte("created_at", endIso);
  const { data: orderRows, error: ordersError } = await ordersQuery;
  if (ordersError) throw ordersError;
  const orders = attachPackDetails((orderRows || []) as any[]);

  // The rest is read side by side. Each is allowed to fail on its own: a
  // report missing its stock table is still worth having.
  const stockSeasonId =
    seasonId ??
    (await supabase.from("seasons").select("id").eq("status", "active").maybeSingle()).data?.id ??
    null;

  const [expensesRes, customerRoleRes, catalogRes, costsRes, districtOf, referrals] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("date, details, reason, spend_by, amount, type, reference_no")
        .gte("date", startIso)
        .lte("date", endIso)
        .order("date", { ascending: true }),
      supabase.from("roles").select("id").eq("name", "customer").maybeSingle(),
      supabase
        .from("season_catalog")
        .select("id, name, product_code, stock, reorder_level, is_active, product_type, order")
        .eq("season_id", stockSeasonId ?? "")
        .order("order", { nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("product_season_costs")
        .select("product_id, apr")
        .eq("season_id", stockSeasonId ?? ""),
      resolveOrderDistricts(orders),
      buildReferrals(orders).catch((error) => {
        console.warn("Referrals left out of the report:", error);
        return [];
      }),
    ]);

  const customerRoleId = customerRoleRes.data?.id ?? null;
  const [allCustomersRes, newCustomersRes] = customerRoleId
    ? await Promise.all([
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("role_id", customerRoleId),
        supabase
          .from("user_profiles")
          .select("full_name, phone, email, city, created_at")
          .eq("role_id", customerRoleId)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: true }),
      ])
    : [null, null];

  // ---- the order book --------------------------------------------------------
  const live = orders.filter((o) => statusOf(o) !== CANCELLED_STATUS);
  const sales = orders.filter((o) => SALE_STATUSES.includes(statusOf(o)));
  const shipped = orders.filter((o) => REVENUE_STATUSES.includes(statusOf(o)));
  const enquiries = orders.filter((o) => statusOf(o) === "enquiry received");
  const cancelled = orders.length - live.length;
  const revenue = revenueSummary(orders);

  const received = sumBy(live, (o) => o.amount_received);
  const discount = sumBy(live, (o) => o.discount_amt);
  const balanceOf = (o: any) => netAmount(o) - Number(o.amount_received || 0);
  const outstanding = sumBy(live, (o) => Math.max(balanceOf(o), 0));
  const extra = sumBy(live, (o) => Math.max(-balanceOf(o), 0));

  const expenses = (expensesRes.data || []) as any[];
  const spent = sumBy(
    expenses.filter((e) => e.type !== "credit"),
    (e) => e.amount
  );
  const credits = sumBy(
    expenses.filter((e) => e.type === "credit"),
    (e) => e.amount
  );

  // Profit as the Dashboard's tile has it: shipped and delivered, at the
  // cost frozen on each line when it was sold, less the discount.
  const profit = sumBy(
    shipped,
    (o) =>
      sumBy(o.items || [], (it: any) =>
        (Number(it.price) - Number(it.apr_snapshot || 0)) * Number(it.quantity || 0)
      ) - Number(o.discount_amt || 0)
  );

  // ---- stock -----------------------------------------------------------------
  const costsReadable = !costsRes.error;
  const costOf = new Map(((costsRes.data || []) as any[]).map((c) => [c.product_id, Number(c.apr || 0)]));
  const stock = ((catalogRes.data || []) as any[]).filter(
    (p) => p.is_active && String(p.product_type || "").toLowerCase() !== "group"
  );
  const stockLevel = (p: any) => {
    const qty = Number(p.stock || 0);
    if (qty <= 0) return "Out of stock";
    return qty <= Math.max(Number(p.reorder_level ?? LOW_STOCK), LOW_STOCK) ? "Low" : "In stock";
  };
  const stockValue = sumBy(stock, (p) => Math.max(Number(p.stock || 0), 0) * (costOf.get(p.id) || 0));

  // ---- summary ---------------------------------------------------------------
  // Counts and rupees share one Value column, so each rupee figure is marked.
  const rs = (value: number): MoneyCell => ({ money: value });
  const summaryRows: ReportCell[][] = [
    ["Orders (confirmed onward)", sales.length],
    ["Open enquiries", enquiries.length],
    ["Cancelled orders", cancelled],
    ["All orders placed", orders.length],
    ["Actual revenue (shipped & delivered)", rs(revenue.totalRevenue)],
    ["Expected revenue (not yet shipped)", rs(revenue.expectedRevenue)],
    ["Total order book (actual + expected)", rs(revenue.totalRevenue + revenue.expectedRevenue)],
    ["Average shipped order", rs(revenue.averageOrderValue)],
    ["Discount given", rs(discount)],
    ["Amount received", rs(received)],
    ["Balance still due", rs(outstanding)],
    ["Extra received (over the order value)", rs(extra)],
    ["Expenses (all but credits)", rs(spent)],
    ["Credits", rs(credits)],
    ["Received less expenses", rs(received - spent)],
    ...(options.includeProfit ? [["Profit (shipped & delivered)", rs(profit)]] : []),
    ["Registered customers (all time)", allCustomersRes?.count ?? "-"],
    ["New customers in this period", newCustomersRes?.data?.length ?? "-"],
    ["Products on sale", stock.length],
    ["Out of stock", stock.filter((p) => stockLevel(p) === "Out of stock").length],
    ["Low stock", stock.filter((p) => stockLevel(p) === "Low").length],
    ...(costsReadable ? [["Stock value at cost", rs(stockValue)]] : []),
  ];

  const tables: ReportTable[] = [];

  tables.push({
    title: "Summary",
    note: "Cancelled orders are listed below but never counted in any figure.",
    columns: [{ header: "Measure" }, { header: "Value", numeric: true }],
    rows: summaryRows,
  });

  tables.push({
    title: "Revenue by stage",
    section: "Revenue & collection",
    chart: { type: "share", label: 0, value: 3, caption: "Order value by stage" },
    columns: [
      { header: "Stage" },
      { header: "Counted as" },
      { header: "Orders", numeric: true },
      { header: "Amount", money: true },
    ],
    rows: [
      ...revenue.revenueByStage.map((s) => [s.stage, "Actual", s.orders, s.amount]),
      ...revenue.expectedByStage.map((s) => [s.stage, "Expected", s.orders, s.amount]),
    ],
    foot: [
      "Total",
      "",
      sumBy([...revenue.revenueByStage, ...revenue.expectedByStage], (s) => s.orders),
      revenue.totalRevenue + revenue.expectedRevenue,
    ],
  });

  // Receipts by how they came in, from the ledger behind "amount received".
  const byMethod = new Map<string, { receipts: number; amount: number }>();
  live.forEach((o) =>
    (o.payments || []).forEach((p: any) => {
      const method = String(p.method || "").trim() || "Not given";
      const entry = byMethod.get(method) ?? { receipts: 0, amount: 0 };
      entry.receipts += 1;
      entry.amount += Number(p.amount || 0);
      byMethod.set(method, entry);
    })
  );
  tables.push({
    title: "Amount received by method",
    section: "Revenue & collection",
    chart: { type: "share", label: 0, value: 2, caption: "Received by payment method" },
    columns: [{ header: "Method" }, { header: "Receipts", numeric: true }, { header: "Amount", money: true }],
    rows: [...byMethod.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([method, m]) => [method, m.receipts, m.amount]),
    foot: ["Total", sumBy([...byMethod.values()], (m) => m.receipts), sumBy([...byMethod.values()], (m) => m.amount)],
  });

  // ---- expenses --------------------------------------------------------------
  const tallyBy = (key: (e: any) => string) => {
    const tally = new Map<string, number>();
    expenses.forEach((e) => tally.set(key(e), (tally.get(key(e)) || 0) + Number(e.amount || 0)));
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  };
  tables.push({
    title: "Expenses by type",
    section: "Expenses",
    chart: { type: "share", label: 0, value: 1, caption: "Expenses by type" },
    columns: [{ header: "Type" }, { header: "Amount", money: true }],
    rows: tallyBy((e) => String(e.type || "other")),
  });
  tables.push({
    title: "Expenses by person",
    section: "Expenses",
    chart: { type: "bars", label: 0, value: 1, limit: 10, caption: "Who spent it" },
    note: "Credits are left out, as on the Dashboard.",
    columns: [{ header: "Spent by" }, { header: "Amount", money: true }],
    rows: (() => {
      const tally = new Map<string, number>();
      expenses
        .filter((e) => e.type !== "credit")
        .forEach((e) => {
          const who = String(e.spend_by || "").trim() || "Not given";
          tally.set(who, (tally.get(who) || 0) + Number(e.amount || 0));
        });
      return [...tally.entries()].sort((a, b) => b[1] - a[1]);
    })(),
    foot: ["Total", spent],
  });
  tables.push({
    title: "Expenses",
    section: "Expenses",
    columns: [
      { header: "Date" },
      { header: "Type" },
      { header: "Spent by" },
      { header: "Details" },
      { header: "Reference" },
      { header: "Amount", money: true },
    ],
    rows: expenses.map((e) => [
      day(e.date),
      String(e.type || ""),
      String(e.spend_by || ""),
      [e.details, e.reason].filter((t) => t && String(t).trim()).join(" — "),
      String(e.reference_no || ""),
      Number(e.amount || 0),
    ]),
    foot: ["", "", "", "", "Total (all types)", sumBy(expenses, (e) => e.amount)],
  });

  // ---- orders ----------------------------------------------------------------
  tables.push({
    title: "Orders",
    section: "Orders",
    chart: { type: "tally", label: 6, money: false, caption: "Orders by status" },
    note: `${orders.length} orders, ${cancelled} cancelled. Totals are of live orders only.`,
    columns: [
      { header: "Order" },
      { header: "Date" },
      { header: "Customer" },
      { header: "Phone" },
      { header: "City" },
      { header: "District" },
      { header: "Status" },
      { header: "Total", money: true },
      { header: "Discount", money: true },
      { header: "Net", money: true },
      { header: "Received", money: true },
      { header: "Balance", money: true },
    ],
    rows: orders.map((o) => [
      String(o.short_id || o.id.slice(0, 8)),
      day(o.created_at),
      String(o.full_name || ""),
      String(o.phone || ""),
      String(o.city || ""),
      districtOf.get(o.id) ?? NOT_RECORDED,
      String(o.status || ""),
      Number(o.total_amount || 0),
      Number(o.discount_amt || 0),
      netAmount(o),
      Number(o.amount_received || 0),
      balanceOf(o),
    ]),
    foot: [
      "Live orders",
      "",
      "",
      "",
      "",
      "",
      String(live.length),
      sumBy(live, (o) => o.total_amount),
      discount,
      sumBy(live, netAmount),
      received,
      sumBy(live, balanceOf),
    ],
  });

  // ---- analytics: the same breakdowns as the Analytics tab -------------------
  const byState = new Map<string, { orders: number; sales: number }>();
  const byDistrict = new Map<string, { orders: number; sales: number }>();
  const byCity = new Map<string, { orders: number; sales: number }>();
  const byMonth = new Map<string, { orders: number; sales: number; sort: string }>();
  const byProduct = new Map<string, { orders: number; qty: number; sales: number }>();
  sales.forEach((o) => {
    const amount = netAmount(o);
    addTo(byState, normalisePlace(o.state), amount);
    addTo(byDistrict, districtOf.get(o.id) ?? NOT_RECORDED, amount);
    addTo(byCity, normalisePlace(o.city), amount);

    const month = format(new Date(o.created_at), "MMM yyyy");
    const m = byMonth.get(month) ?? { orders: 0, sales: 0, sort: format(new Date(o.created_at), "yyyy-MM") };
    m.orders += 1;
    m.sales += amount;
    byMonth.set(month, m);

    const seen = new Set<string>();
    (o.items || []).forEach((it: any) => {
      const name = it.product?.name || "Unknown";
      const p = byProduct.get(name) ?? { orders: 0, qty: 0, sales: 0 };
      p.qty += Number(it.quantity || 0);
      p.sales += Number(it.total_price || 0);
      if (!seen.has(name)) p.orders += 1;
      seen.add(name);
      byProduct.set(name, p);
    });
  });

  tables.push({
    title: "Sales by month",
    section: "Sales analytics",
    chart: { type: "columns", label: 0, value: 2, caption: "Sales by month" },
    columns: [{ header: "Month" }, { header: "Orders", numeric: true }, { header: "Sales", money: true }],
    rows: [...byMonth.entries()]
      .sort((a, b) => a[1].sort.localeCompare(b[1].sort))
      .map(([month, m]) => [month, m.orders, m.sales]),
    foot: ["Total", sales.length, sumBy(sales, netAmount)],
  });
  tables.push(placeTable("State-wise sales", "State", byState));
  tables.push(placeTable("District-wise sales", "District", byDistrict));
  tables.push(placeTable("City-wise sales", "City", byCity));
  tables.push({
    title: "Product-wise sales",
    section: "Sales analytics",
    chart: { type: "bars", label: 0, value: 3, limit: 10, caption: "Top 10 products by sales" },
    note: "Line values before order discounts. Orders counts each order once per product.",
    columns: [
      { header: "Product" },
      { header: "Orders", numeric: true },
      { header: "Quantity", numeric: true },
      { header: "Sales", money: true },
    ],
    rows: [...byProduct.entries()]
      .sort((a, b) => b[1].sales - a[1].sales)
      .map(([name, p]) => [name, p.orders, p.qty, p.sales]),
    foot: [
      "Total",
      "",
      sumBy([...byProduct.values()], (p) => p.qty),
      sumBy([...byProduct.values()], (p) => p.sales),
    ],
  });
  if (referrals.length > 0) {
    tables.push({
      title: "Referrals",
      section: "Sales analytics",
      chart: { type: "bars", label: 0, value: 3, limit: 10, caption: "Top referrers by order value" },
      columns: [
        { header: "Referrer" },
        { header: "Phone" },
        { header: "Orders", numeric: true },
        { header: "Order value", money: true },
        { header: "Bonus", money: true },
      ],
      rows: referrals.map((r) => [r.name || "-", r.phoneDisplay, r.ordersCount, r.totalValue, r.bonus]),
      foot: [
        "Total",
        "",
        sumBy(referrals, (r) => r.ordersCount),
        sumBy(referrals, (r) => r.totalValue),
        sumBy(referrals, (r) => r.bonus),
      ],
    });
  }

  // ---- customers -------------------------------------------------------------
  tables.push({
    title: "New customers",
    section: "Customers",
    note: `Accounts created in this period. Registered customers in all: ${allCustomersRes?.count ?? "-"}.`,
    columns: [{ header: "Name" }, { header: "Phone" }, { header: "Email" }, { header: "City" }, { header: "Joined" }],
    rows: ((newCustomersRes?.data || []) as any[]).map((u) => [
      String(u.full_name || "-"),
      String(u.phone || ""),
      String(u.email || ""),
      String(u.city || ""),
      day(u.created_at),
    ]),
  });

  // ---- stock -----------------------------------------------------------------
  tables.push({
    title: "Stock availability",
    section: "Stock",
    chart: { type: "tally", label: 3, money: false, caption: "Products by stock status" },
    note: seasonId
      ? "Stock as it stands now for this season."
      : "No season selected, so this is the live season's stock as it stands now.",
    columns: [
      { header: "Code" },
      { header: "Product" },
      { header: "Stock", numeric: true },
      { header: "Status" },
      ...(costsReadable ? [{ header: "Value at cost", money: true }] : []),
    ],
    rows: stock.map((p) => [
      String(p.product_code || ""),
      String(p.name || ""),
      Number(p.stock || 0),
      stockLevel(p),
      ...(costsReadable ? [Math.max(Number(p.stock || 0), 0) * (costOf.get(p.id) || 0)] : []),
    ]),
    foot: [
      "",
      `${stock.length} products`,
      sumBy(stock, (p) => Math.max(Number(p.stock || 0), 0)),
      "",
      ...(costsReadable ? [stockValue] : []),
    ],
  });

  // The PDF's headline cards: the figures the Overview tiles lead with.
  const kpis: ReportKpi[] = [
    { label: "Actual revenue", value: revenue.totalRevenue, money: true, note: "Shipped & delivered", tone: "brand" },
    { label: "Expected revenue", value: revenue.expectedRevenue, money: true, note: "Not yet shipped", tone: "warn" },
    { label: "Amount received", value: received, money: true, note: `Discount given Rs. ${Math.round(discount).toLocaleString("en-IN")}`, tone: "good" },
    { label: "Yet to receive", value: outstanding, money: true, note: extra > 0.01 ? `Extra received Rs. ${Math.round(extra).toLocaleString("en-IN")}` : "Balance on live orders", tone: "bad" },
    { label: "Expenses", value: spent, money: true, note: `Received less expenses Rs. ${Math.round(received - spent).toLocaleString("en-IN")}`, tone: "neutral" },
    { label: "Orders", value: sales.length, note: `${enquiries.length} enquiries · ${cancelled} cancelled`, tone: "neutral" },
    { label: "New customers", value: newCustomersRes?.data?.length ?? 0, note: `${allCustomersRes?.count ?? "-"} registered in all`, tone: "neutral" },
    ...(costsReadable
      ? [{ label: "Stock value", value: stockValue, money: true, note: `${stock.length} products · ${stock.filter((p) => stockLevel(p) === "Out of stock").length} out of stock`, tone: "neutral" as const }]
      : []),
    ...(options.includeProfit
      ? [{ label: "Profit", value: profit, money: true, note: "Shipped & delivered", tone: (profit < 0 ? "bad" : "good") as ReportKpi["tone"] }]
      : []),
  ];

  return {
    periodLabel,
    generatedAt: new Date(),
    business,
    kpis,
    collection: { received, due: outstanding, extra },
    tables,
  };
}

export const isMoneyCell = (value: unknown): value is MoneyCell =>
  typeof value === "object" && value !== null && "money" in value;

/** A cell as plain text for the CSV: numbers unformatted, so a spreadsheet can add them. */
function csvValue(value: unknown): string {
  if (isMoneyCell(value)) return value.money.toFixed(2);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value ?? "");
}

const csvEscape = (text: string) =>
  /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/**
 * The report as one CSV: each table under its own title, a blank line
 * between. CSV has no sheets, and one file is what was asked for; a
 * spreadsheet opens it as one long sheet with each section labelled.
 * Starts with a byte-order mark so Excel reads it as UTF-8 (Tamil names).
 */
export function seasonReportCsv(report: SeasonReport): string {
  const lines: string[] = [
    csvEscape(`${report.business.name} — Season report`),
    csvEscape(`Period: ${report.periodLabel}`),
    csvEscape(`Generated: ${format(report.generatedAt, "dd MMM yyyy, h:mm a")}`),
    "Amounts in rupees.",
    "",
  ];
  report.tables.forEach((table) => {
    lines.push(csvEscape(table.title.toUpperCase()));
    if (table.note) lines.push(csvEscape(table.note));
    lines.push(table.columns.map((c) => csvEscape(c.header)).join(","));
    if (table.rows.length === 0) lines.push("None");
    table.rows.forEach((row) => lines.push(row.map((v) => csvEscape(csvValue(v))).join(",")));
    if (table.foot && table.rows.length > 0) {
      lines.push(table.foot.map((v) => csvEscape(csvValue(v))).join(","));
    }
    lines.push("");
  });
  return "﻿" + lines.join("\r\n");
}

export const seasonReportFileName = (periodLabel: string, extension: "csv" | "pdf") =>
  `report-${periodLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.${extension}`;
