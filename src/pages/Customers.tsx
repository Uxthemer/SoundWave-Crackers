import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  Download,
  Users,
  Repeat,
  UserPlus,
  Clock,
  IndianRupee,
  Phone,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

/**
 * One customer, as summarised by the customer_summary view.
 *
 * Keyed by phone number rather than by account: guest checkout means most
 * people have no account, and the same person ordering twice -- once signed
 * in, once as a guest -- is still one customer.
 */
interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  has_account: boolean;
  total_orders: number;
  confirmed_orders: number;
  cancelled_orders: number;
  open_enquiries: number;
  total_spent: number;
  total_received: number;
  average_order_value: number;
  largest_order: number;
  first_order_at: string;
  last_order_at: string;
  last_purchase_at: string | null;
  seasons_bought: number;
  segment: "new" | "repeat" | "loyal" | "returning" | "enquiry_only";
  is_dormant: boolean;
}

const SEGMENTS: {
  key: Customer["segment"];
  label: string;
  hint: string;
  className: string;
}[] = [
  {
    key: "new",
    label: "New",
    hint: "Bought once",
    className: "bg-blue-100 text-blue-700",
  },
  {
    key: "repeat",
    label: "Repeat",
    hint: "Bought 2–3 times",
    className: "bg-teal-100 text-teal-700",
  },
  {
    key: "loyal",
    label: "Loyal",
    hint: "Bought 4+ times",
    className: "bg-green-100 text-green-700",
  },
  {
    key: "returning",
    label: "Returning",
    hint: "Bought across more than one season",
    className: "bg-purple-100 text-purple-700",
  },
  {
    key: "enquiry_only",
    label: "Enquiry only",
    hint: "Asked, never confirmed",
    className: "bg-gray-200 text-gray-700",
  },
];

const segmentStyle = (segment: string) =>
  SEGMENTS.find((s) => s.key === segment) ?? SEGMENTS[4];

type SortField =
  | "name"
  | "total_spent"
  | "confirmed_orders"
  | "last_order_at"
  | "average_order_value";

const money = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;

export function Customers() {
  const { userRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [dormantOnly, setDormantOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("total_spent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("customer_summary")
        .select("*")
        .order("total_spent", { ascending: false });

      if (err) {
        console.error("Failed to load customers:", err);
        setError(err.message);
      } else {
        setCustomers((data as Customer[]) ?? []);
        setError(null);
      }
      setLoading(false);
    };
    load();
  }, []);

  /**
   * The customer's own order history, fetched only when their row is opened.
   * Loading every order for every customer up front would pull the whole
   * orders table to draw a list of names.
   */
  const openCustomer = async (customer: Customer) => {
    setSelected(customer);
    setSelectedOrders([]);
    setLoadingOrders(true);
    const { data } = await supabase
      .from("orders")
      .select("id, short_id, created_at, status, total_amount, amount_received")
      .eq("phone", customer.phone)
      .order("created_at", { ascending: false });
    setSelectedOrders(data ?? []);
    setLoadingOrders(false);
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = customers.filter((customer) => {
      if (segmentFilter !== "all" && customer.segment !== segmentFilter)
        return false;
      if (dormantOnly && !customer.is_dormant) return false;
      if (!needle) return true;
      return [
        customer.name,
        customer.phone,
        customer.email,
        customer.city,
        customer.district,
        customer.state,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    return [...rows].sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortField === "name") {
        return direction * String(a.name ?? "").localeCompare(String(b.name ?? ""));
      }
      if (sortField === "last_order_at") {
        return (
          direction *
          (new Date(a.last_order_at).getTime() -
            new Date(b.last_order_at).getTime())
        );
      }
      return direction * (Number(a[sortField]) - Number(b[sortField]));
    });
  }, [customers, search, segmentFilter, dormantOnly, sortField, sortDir]);

  /** Headline figures, over whatever is currently filtered. */
  const stats = useMemo(() => {
    const revenue = filtered.reduce((sum, c) => sum + Number(c.total_spent), 0);
    const buyers = filtered.filter((c) => c.confirmed_orders > 0);
    return {
      customers: filtered.length,
      buyers: buyers.length,
      revenue,
      repeatBuyers: filtered.filter((c) => c.confirmed_orders > 1).length,
      dormant: filtered.filter((c) => c.is_dormant).length,
      // Per buyer, not per customer: people who only ever enquired would drag
      // this to a number that describes nobody.
      averageLifetimeValue: buyers.length ? revenue / buyers.length : 0,
    };
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const exportCustomers = () => {
    const rows = filtered.map((customer) => ({
      Name: customer.name ?? "",
      Phone: customer.phone,
      Email: customer.email ?? "",
      City: customer.city ?? "",
      District: customer.district ?? "",
      State: customer.state ?? "",
      Segment: segmentStyle(customer.segment).label,
      "Total orders": customer.total_orders,
      "Confirmed orders": customer.confirmed_orders,
      "Open enquiries": customer.open_enquiries,
      Cancelled: customer.cancelled_orders,
      "Total spent": Number(customer.total_spent).toFixed(2),
      "Amount received": Number(customer.total_received).toFixed(2),
      "Average order": Number(customer.average_order_value).toFixed(2),
      "Seasons bought": customer.seasons_bought,
      "First order": customer.first_order_at
        ? format(new Date(customer.first_order_at), "yyyy-MM-dd")
        : "",
      "Last order": customer.last_order_at
        ? format(new Date(customer.last_order_at), "yyyy-MM-dd")
        : "",
      Dormant: customer.is_dormant ? "Yes" : "No",
      Account: customer.has_account ? "Registered" : "Guest",
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Customers");
    XLSX.writeFile(book, `soundwave_customers_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!["admin", "superadmin"].includes(userRole?.name || "")) {
    return (
      <div className="min-h-screen pt-24 pb-12 text-center">
        <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
          <div>
            <h1 className="font-heading text-4xl">Customers</h1>
            <p className="text-text/70 mt-1">
              Grouped by phone number, so a guest order and a signed-in order
              from the same person count as one customer.
            </p>
          </div>
          <button
            onClick={exportCustomers}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40"
          >
            <Download className="w-5 h-5" />
            <span>Export</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-600">
            <p className="font-semibold">Could not load customers</p>
            <p className="text-sm">{error}</p>
            <p className="text-sm mt-1">
              If this mentions customer_summary, the migration adding that view
              has not been run yet.
            </p>
          </div>
        )}

        {/* Headline figures */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            {
              label: "Customers",
              value: stats.customers,
              icon: Users,
              hint: `${stats.buyers} have bought`,
            },
            {
              label: "Repeat buyers",
              value: stats.repeatBuyers,
              icon: Repeat,
              hint: "More than one confirmed order",
            },
            {
              label: "Revenue",
              value: money(stats.revenue),
              icon: IndianRupee,
              hint: "Confirmed orders only",
            },
            {
              label: "Avg. lifetime value",
              value: money(stats.averageLifetimeValue),
              icon: UserPlus,
              hint: "Per buying customer",
            },
            {
              label: "Dormant",
              value: stats.dormant,
              icon: Clock,
              hint: "No purchase in a year",
            },
          ].map((tile) => (
            <div key={tile.label} className="bg-card/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-text/60 mb-1">
                <tile.icon className="w-4 h-4" />
                <span className="text-sm">{tile.label}</span>
              </div>
              <p className="text-2xl font-bold">{tile.value}</p>
              <p className="text-xs text-text/50 mt-1">{tile.hint}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, town…"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/60" />
          </div>
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
          >
            <option value="all">All segments</option>
            {SEGMENTS.map((segment) => (
              <option key={segment.key} value={segment.key}>
                {segment.label} — {segment.hint}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-card-border/10 cursor-pointer">
            <input
              type="checkbox"
              checked={dormantOnly}
              onChange={(e) => setDormantOnly(e.target.checked)}
            />
            <span className="text-sm">Dormant only</span>
          </label>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-22rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-card [&>th]:shadow-[inset_0_-1px_0_0_rgb(0_0_0/0.12)]">
                  {(
                    [
                      ["name", "Customer", "text-left"],
                      ["", "Location", "text-left"],
                      ["", "Segment", "text-left"],
                      ["confirmed_orders", "Orders", "text-right"],
                      ["total_spent", "Total spent", "text-right"],
                      ["average_order_value", "Avg. order", "text-right"],
                      ["last_order_at", "Last order", "text-left"],
                    ] as [SortField | "", string, string][]
                  ).map(([field, label, align], index) => (
                    <th
                      key={`${label}-${index}`}
                      onClick={field ? () => toggleSort(field) : undefined}
                      className={`py-3 px-4 ${align} ${
                        field ? "cursor-pointer" : ""
                      }`}
                    >
                      <span
                        className={`flex items-center gap-1 ${
                          align === "text-right" ? "justify-end" : ""
                        }`}
                      >
                        {label}
                        {field && sortField === field
                          ? sortDir === "asc"
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />
                          : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-orange" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-text/60">
                      No customers match those filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((customer) => {
                    const style = segmentStyle(customer.segment);
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => openCustomer(customer)}
                        className="border-t border-card-border/10 hover:bg-card/40 cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium">
                            {customer.name || "—"}
                            {!customer.has_account && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                                GUEST
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-text/60 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {customer.phone}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <p>{customer.city || "—"}</p>
                          <p className="text-xs text-text/60">
                            {[customer.district, customer.state]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${style.className}`}
                          >
                            {style.label}
                          </span>
                          {customer.is_dormant && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700">
                              Dormant
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <p className="font-medium">
                            {customer.confirmed_orders}
                          </p>
                          {customer.open_enquiries > 0 && (
                            <p className="text-xs text-amber-600">
                              +{customer.open_enquiries} open
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {money(customer.total_spent)}
                        </td>
                        <td className="py-3 px-4 text-right text-text/80">
                          {money(customer.average_order_value)}
                        </td>
                        <td className="py-3 px-4 text-sm whitespace-nowrap">
                          {customer.last_order_at
                            ? format(
                                new Date(customer.last_order_at),
                                "d MMM yyyy"
                              )
                            : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* One customer's history */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background flex items-start justify-between p-6 border-b border-card-border/10">
              <div>
                <h2 className="font-heading text-2xl">
                  {selected.name || selected.phone}
                </h2>
                <p className="text-sm text-text/60">
                  {selected.phone}
                  {selected.email ? ` · ${selected.email}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="p-2 hover:bg-card/50 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Orders", selected.confirmed_orders],
                  ["Total spent", money(selected.total_spent)],
                  ["Avg. order", money(selected.average_order_value)],
                  ["Largest", money(selected.largest_order)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-card/40 rounded-lg p-3">
                    <p className="text-xs text-text/60">{label}</p>
                    <p className="font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="text-sm space-y-1">
                <p>
                  <span className="text-text/60">Address: </span>
                  {[
                    selected.address,
                    selected.city,
                    selected.district,
                    selected.state,
                    selected.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                <p>
                  <span className="text-text/60">Customer since: </span>
                  {selected.first_order_at
                    ? format(new Date(selected.first_order_at), "d MMM yyyy")
                    : "—"}
                  {selected.seasons_bought > 1 &&
                    ` · bought in ${selected.seasons_bought} seasons`}
                </p>
                {Number(selected.total_spent) -
                  Number(selected.total_received) >
                  0.01 && (
                  <p className="text-red-600 font-medium">
                    Outstanding:{" "}
                    {money(
                      Number(selected.total_spent) -
                        Number(selected.total_received)
                    )}
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Order history</h3>
                {loadingOrders ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary-orange" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-card-border/10">
                        <th className="py-2">Order</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Status</th>
                        <th className="py-2 text-right">Amount</th>
                        <th className="py-2 text-right">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b border-card-border/10"
                        >
                          <td className="py-2 font-mono text-xs">
                            {order.short_id || order.id.slice(0, 8)}
                          </td>
                          <td className="py-2">
                            {format(new Date(order.created_at), "d MMM yyyy")}
                          </td>
                          <td className="py-2">{order.status}</td>
                          <td className="py-2 text-right">
                            {money(order.total_amount)}
                          </td>
                          <td className="py-2 text-right">
                            {money(order.amount_received)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
