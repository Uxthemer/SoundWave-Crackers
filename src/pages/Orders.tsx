import { useState, useEffect } from "react";
import { ReceiptText, Percent, Printer, Loader2, Eye, Download, X, Search, ChevronDown, ChevronUp, Plus, IndianRupee, CheckCircle2, RotateCcw, TrendingUp, TrendingDown, PackageCheck, Filter, Pencil, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { attachPackDetails } from "../lib/orderItems";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { InvoiceTemplate } from "../components/InvoiceTemplate";
import EditOrderModal, { OrderForEdit } from "../components/EditOrderModal";
import { useDateRange } from "../hooks/useDateRange";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useAppSettings } from "../context/AppSettingsContext";
import {
  businessFromSettings,
  type BusinessDetails,
} from "../lib/businessDetails";
import { buildDocumentPdf, documentFileName } from "../lib/documentPdf";
import {
  WhatsAppShareDialog,
  type WhatsAppShareRequest,
} from "../components/WhatsAppShareDialog";
import { webChatUrl, whatsappNumber } from "../lib/whatsappShare";
import { FaWhatsapp } from "react-icons/fa";
import toast from "react-hot-toast";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  total_price: number;
  /** Cost price frozen at the moment the order was placed. */
  apr_snapshot?: number | null;
  product: {
    name: string;
    product_code?: string; // added product code
    order?: number;
    categories: {
      name: string;
    };
  };
}

interface Order {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  total_amount: number;
  status: string;
  payment_method: string;
  items?: OrderItem[];
  discount_amt?: number;
  discount_percentage?: string;
  short_id?: string;
  referred_by?: string;
  season_id?: string | null;
  /** NULL when the order came from guest checkout, with no account behind it. */
  user_id?: string | null;
  // Payment is its own axis, independent of the fulfilment status above.
  amount_received?: number | null;
  payment_status?: string | null;
  payment_received_at?: string | null;
  confirmed_at?: string | null;
  /** Lorry receipt, set when the order is marked Shipped. */
  lr_number?: string | null;
}

/**
 * Fulfilment only.
 *
 * "Payment Completed" used to sit in this list, which meant recording money
 * moved the order backwards out of packing, and packing an order lost the
 * fact it had been paid for. Money arrives whenever the customer sends it, so
 * it is tracked separately -- see the Payment column.
 */
const ORDER_STATUSES = [
  "Enquiry Received",
  "Order Confirmed",
  "Packing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

/**
 * Statuses that hold stock. Reaching any of them means the goods are spoken
 * for; this list matches order_holds_stock() in the database exactly.
 */
const COMMITTED_STATUSES = [
  "Order Confirmed",
  "Packing",
  "Shipped",
  "Delivered",
];

/** Fulfilment cannot progress past an order nobody has confirmed yet. */
const REQUIRES_CONFIRMATION = ["Packing", "Shipped", "Delivered"];

/**
 * Where a confirmed order may move from the status column. Mirrors
 * enforce_order_status_transition() in the database: moves among the
 * confirmed statuses are free (they all hold the same stock), and the way out
 * is Cancel. Enquiries are confirmed with the button, never from here.
 */
const CONFIRMED_NEXT = [
  "Order Confirmed",
  "Packing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

/** Confirmed and fully paid: nothing stands between it and the packing table. */
const isReadyForPacking = (order: { status: string; payment_status?: string | null }) =>
  order.status === "Order Confirmed" && order.payment_status === "received";

/** Status filter value for the Ready for packing tile. */
const READY_FOR_PACKING = "__ready_for_packing";

/** The one status that is hidden unless it is the status being asked for. */
const CANCELLED = "Cancelled";

const PAYMENT_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Unpaid", className: "bg-red-100 text-red-700" },
  partial: { label: "Part paid", className: "bg-amber-100 text-amber-700" },
  received: { label: "Paid", className: "bg-green-100 text-green-700" },
  refunded: { label: "Refunded", className: "bg-gray-200 text-gray-700" },
};

/** The sentence that explains what the status means, in the customer's terms. */
const STATUS_NOTES: Record<string, string> = {
  "Enquiry Received":
    "We have your enquiry and will confirm the details with you shortly.",
  "Order Confirmed": "Your order is confirmed and is being prepared.",
  Packing: "Your order is being packed and will be dispatched soon.",
  Shipped: "Your order has been dispatched and is on its way.",
  Delivered:
    "Your order has been delivered. We hope you have a wonderful celebration!",
  Cancelled:
    "Your order has been cancelled. Do let us know if this was not expected.",
};

/**
 * The status update that WhatsApp opens with already typed.
 *
 * Staff answer "where is my order" several times a day, by hand, from
 * whatever is on screen — so the amounts get retyped wrong and every customer
 * hears it differently. This puts the row's own figures into the chat and
 * leaves it there to edit or send as it stands.
 *
 * Only what the order actually carries goes in. An LR number before it ships,
 * or a balance on a fully paid order, is left out rather than printed empty.
 */
function statusUpdateMessage(order: Order, business: BusinessDetails): string {
  const number = order.short_id || order.id.slice(0, 8);
  const grand =
    Number(order.total_amount || 0) - Number(order.discount_amt || 0);
  const received = Number(order.amount_received || 0);
  const balance = grand - received;
  const lrNumber = String(order.lr_number ?? "").trim();

  const lines = [
    `Hello ${order.full_name || "there"},`,
    "",
    `Here is an update on your order with ${business.name}.`,
    "",
    `Order: ${number}`,
    `Placed: ${format(new Date(order.created_at), "dd MMM yyyy, h:mm a")}`,
    `Total: Rs. ${grand.toFixed(2)}`,
    `Status: ${order.status}`,
  ];

  const payment = PAYMENT_LABELS[order.payment_status || "pending"]?.label;
  if (payment) lines.push(`Payment: ${payment}`);
  // Worth spelling out only while money is actually outstanding.
  if (received > 0 && balance > 0) {
    lines.push(
      `Received: Rs. ${received.toFixed(2)} | Balance: Rs. ${balance.toFixed(2)}`
    );
  }
  if (order.status === "Shipped" && lrNumber) {
    lines.push(`LR Number: ${lrNumber}`);
  }

  const note = STATUS_NOTES[order.status];
  if (note) lines.push("", note);

  lines.push("", `Thank you for shopping with ${business.name}.`);

  // How to reach us, signed off the way the invoices are. Both come from
  // Admin Settings, so a number changes in one place rather than in every
  // message that quotes it.
  if (business.website) lines.push("", business.website);
  if (business.phone) lines.push(`Contact: ${business.phone}`);

  return lines.join("\n");
}

export function Orders() {
  const { userRole } = useAuth();
  const { settings: appSettings } = useAppSettings();
  /** Named and signed off in the WhatsApp status updates sent from the rows below. */
  const business = businessFromSettings(appSettings);
  const [shareRequest, setShareRequest] = useState<WhatsAppShareRequest | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "pending" | "partial" | "received" | "refunded"
  >("all");
  const [customerFilter, setCustomerFilter] = useState<
    "all" | "guest" | "registered"
  >("all");
  // Recording a receipt: which order, how much, and how it arrived.
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState("UPI");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [sortField, setSortField] = useState<keyof Order>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [orderStats, setOrderStats] = useState<Record<string, number>>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{
    orderId: string;
    newStatus: string;
  } | null>(null);
  const [lrNumber, setLRNumber] = useState("");
  const [lrError, setLRError] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountOrderId, setDiscountOrderId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState<number | string>("");
  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount");
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);


  // profit modal state (superadmin only)
  const [profitModalOrder, setProfitModalOrder] = useState<Order | null>(null);
  const [profitBreakdown, setProfitBreakdown] = useState<{ revenue: number; cost: number; discount: number; profit: number } | null>(null);
  
  // Date range filter logic
  const { range, setRange, customStart, setCustomStart, customEnd, setCustomEnd, getDateRange, ready } = useDateRange();
  const [isApplying, setIsApplying] = useState(false);

  // Wait for the season list before the first fetch, otherwise this fires once
  // against the "all" default and again once the active season resolves, and
  // the two responses can land out of order.
  useEffect(() => {
    if (!ready) return;
    if (range !== "custom") {
      handleFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ready]);

  const handleFetch = async () => {
    const { startDate, endDate } = getDateRange();
    await fetchOrders(startDate, endDate);
  };

  const handleApplyCustom = async () => {
    setIsApplying(true);
    await handleFetch();
    setIsApplying(false);
  };

  const fetchOrders = async (startDate?: Date, endDate?: Date) => {
    try {
      let query = supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items (
            *,
            product:products (
              id,
              name,
              product_code,
              categories:categories ( name )
            ),
            pack:combo_packs ( id, name, pack_code )
          )
        `
        )
        .order("created_at", { ascending: false });

       if (startDate && endDate) {
         query = query
           .gte("created_at", startDate.toISOString())
           .lte("created_at", endDate.toISOString());
       }

      const { data, error } = await query;
       if (error) throw error;

       // Family pack lines carry no product; present the pack as one so the
       // table, the invoice and the exports below read it the same way.
       attachPackDetails((data || []) as any[]);

       // Print/export order the items by their catalog display order. That
       // now lives on product_seasons, so resolve it per season and attach it
       // where the rest of this file already expects it (item.product.order).
       const seasonIds = Array.from(
         new Set((data || []).map((o: any) => o.season_id).filter(Boolean))
       );
       if (seasonIds.length > 0) {
         const { data: displayOrders } = await supabase
           .from("product_seasons")
           .select("season_id, product_id, display_order")
           .in("season_id", seasonIds);

         const orderByKey = new Map(
           (displayOrders || []).map((r: any) => [
             `${r.season_id}:${r.product_id}`,
             r.display_order,
           ])
         );

         (data || []).forEach((o: any) => {
           (o.items || []).forEach((it: any) => {
             if (it.product) {
               it.product.order =
                 orderByKey.get(`${o.season_id}:${it.product_id}`) ?? 0;
             }
           });
         });
       }

       setOrders(data || []);
       // build status counts for the dashboard tiles
       const stats: Record<string, number> = {};
       ORDER_STATUSES.forEach((s) => (stats[s] = 0));
       (data || []).forEach((o: any) => {
         const st = o.status || "Unknown";
         stats[st] = (stats[st] || 0) + 1;
       });
       setOrderStats(stats);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  // compute revenue/cost/discount/profit for an order
  const computeProfitBreakdown = (order: Order) => {
    const revenue = Number(order.total_amount || 0);
    const discount = Number(order.discount_amt || 0);
    // Cost comes from the snapshot taken when the order was placed, never
    // from the live catalog — otherwise re-pricing a product silently
    // rewrites the profit reported for past orders.
    const cost = (order.items || []).reduce((s, it) => {
      const apr = Number((it as any)?.apr_snapshot || 0);
      const qty = Number(it.quantity || 0);
      return s + apr * qty;
    }, 0);
    const profit = +(revenue - cost - discount);
    return { revenue, cost, discount, profit };
  };
  
  const handleShowProfit = (order: Order) => {
    const breakdown = computeProfitBreakdown(order);
    setProfitBreakdown(breakdown);
    setProfitModalOrder(order);
  };
  
  const handleCloseProfit = () => {
    setProfitModalOrder(null);
    setProfitBreakdown(null);
  };

  const handleSort = (field: keyof Order) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleStatusChange = (orderId: string, newStatus: string) => {
    if (!["admin", "superadmin"].includes(userRole?.name || "")) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order || newStatus === order.status) return;

    // Packing something nobody has confirmed would commit stock without ever
    // checking it exists. Confirmation is the step that does that check.
    if (
      REQUIRES_CONFIRMATION.includes(newStatus) &&
      !COMMITTED_STATUSES.includes(order.status)
    ) {
      alert(
        "Confirm this order first. Confirming checks stock is available and reserves it."
      );
      return;
    }

    setPendingStatus({ orderId, newStatus });
    setShowConfirmModal(true);
    setLRNumber("");
    setLRError("");
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatus) return;
    if (pendingStatus.newStatus === "Shipped" && !lrNumber.trim()) {
      setLRError("LR Number is required for Shipped status.");
      return;
    }
    setUpdatingStatus(true);
    try {
      // Confirming is not a plain status write. confirm_order locks the stock
      // it is about to spend, so two admins confirming different orders for
      // the same product at the same moment cannot both succeed against the
      // same units.
      if (pendingStatus.newStatus === "Order Confirmed") {
        const { error: confirmError } = await supabase.rpc("confirm_order", {
          p_order_id: pendingStatus.orderId,
          p_allow_shortfall: false,
        });
        if (confirmError) {
          // "Not enough stock: X (need 5, have 2)" is the useful half; show
          // it rather than a generic failure.
          setLRError(confirmError.message);
          setUpdatingStatus(false);
          return;
        }
      } else {
        const updateObj: any = { status: pendingStatus.newStatus };
        if (pendingStatus.newStatus === "Shipped") {
          updateObj.lr_number = lrNumber.trim();
        }
        const { error } = await supabase
          .from("orders")
          .update(updateObj)
          .eq("id", pendingStatus.orderId);

        if (error) throw error;
      }

      // Stock is not touched here. Cancelling (and un-cancelling) moves it in
      // the database, through the orders_stock_sync trigger, so the guest
      // checkout and any other path behave the same way. Doing it here as
      // well would hand the stock back twice.

      setOrders(
        orders.map((order) =>
          order.id === pendingStatus.orderId
            ? {
                ...order,
                status: pendingStatus.newStatus,
                ...(pendingStatus.newStatus === "Shipped"
                  ? { lr_number: lrNumber.trim() }
                  : {}),
              }
            : order
        )
      );

      if (selectedOrder?.id === pendingStatus.orderId) {
        setSelectedOrder({
          ...selectedOrder,
          status: pendingStatus.newStatus,
          ...(pendingStatus.newStatus === "Shipped"
            ? { lr_number: lrNumber.trim() }
            : {}),
        });
      }
      setShowConfirmModal(false);
      setPendingStatus(null);
      setLRNumber("");
      setLRError("");

      // Confirming and cancelling both move stock in the database. Reload so
      // confirmed_at and anything derived from it match what was written.
      if (
        pendingStatus.newStatus === "Order Confirmed" ||
        pendingStatus.newStatus === "Cancelled"
      ) {
        fetchOrders();
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      // The database refuses moves the workflow does not allow ("Confirm
      // this order before moving it to Packing") -- that sentence is the
      // useful part, so it is shown instead of a generic failure.
      const message =
        (error as { message?: string } | null)?.message ??
        "Failed to update order status. Please try again.";
      setLRError(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  /** Opens the receipt form, pre-filled with whatever is still outstanding. */
  const openPaymentModal = (order: Order) => {
    const outstanding =
      Number(order.total_amount || 0) - Number(order.amount_received || 0);
    setPaymentOrder(order);
    setPaymentAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
    setPaymentMethodInput(order.payment_method || "UPI");
    setPaymentReference("");
    setPaymentNote("");
    setPaymentError("");
  };

  /**
   * Records money received against an order.
   *
   * Deliberately separate from the status dropdown: payment can arrive before
   * packing, during shipping, or after delivery, and none of those should
   * move the order backwards in fulfilment.
   */
  const handleRecordPayment = async () => {
    if (!paymentOrder) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setPaymentError("Enter the amount received.");
      return;
    }

    setSavingPayment(true);
    setPaymentError("");
    try {
      const { data, error } = await supabase.rpc("record_order_payment", {
        p_order_id: paymentOrder.id,
        p_amount: amount,
        p_method: paymentMethodInput || null,
        p_reference: paymentReference || null,
        p_note: paymentNote || null,
      });
      if (error) throw error;

      const result = data as any;
      setOrders((prev) =>
        prev.map((order) =>
          order.id === paymentOrder.id
            ? {
                ...order,
                amount_received: result?.amount_received ?? order.amount_received,
                payment_status: result?.payment_status ?? order.payment_status,
              }
            : order
        )
      );
      setPaymentOrder(null);
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Failed to record the payment"
      );
    } finally {
      setSavingPayment(false);
    }
  };

  const handleCancelModal = () => {
    setShowConfirmModal(false);
    setPendingStatus(null);
    setLRNumber("");
    setLRError("");
  };

  const exportOrder = (order: Order) => {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Order details sheet
    const orderDetails = {
      "Order ID": order.id,
      "Customer Name": order.full_name,
      Email: order.email,
      Phone: order.phone,
      "Alternate Phone": order.alternate_phone || "-",
      Address: order.address,
      City: order.city,
      State: order.state,
      Pincode: order.pincode,
      "Total Amount": order.total_amount,
      Status: order.status,
      "Payment Method": order.payment_method,
      "Order Date": format(new Date(order.created_at), "PPpp"),
    };
    const wsOrder = XLSX.utils.json_to_sheet([orderDetails]);
    XLSX.utils.book_append_sheet(wb, wsOrder, "Order Details");

    // Order items sheet - now includes APR
    const sortedOrderItems = (order.items || []).slice().sort((a: any, b: any) => {
      const ao = Number(a.product?.order ?? 0);
      const bo = Number(b.product?.order ?? 0);
      return ao - bo;
    });
    const orderItems = sortedOrderItems.map((item: any, index: number) => ({
      "S.No": index + 1,
      "Product Code":
        (item.product as any)?.product_code ||
        (item.product as any)?.code ||
        "-",
      Product: item.product.name,
      Category: item.product.categories.name,
      Quantity: item.quantity,
      Price: item.price,
      APR: (item as any)?.apr_snapshot ?? "-", // cost snapshotted at sale time
      Total: item.total_price,
    })) || [];
    const wsItems = XLSX.utils.json_to_sheet(orderItems);
    XLSX.utils.book_append_sheet(wb, wsItems, "Order Items");

    // Write file
    XLSX.writeFile(wb, `order-${order.id}.xlsx`);
  };

  const exportAllOrders = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Orders summary sheet
    const orderData = orders.map((order) => ({
      "Order ID": order.id,
      "Customer Name": order.full_name,
      Phone: order.phone,
      City: order.city,
      "Total Amount": order.total_amount,
      Status: order.status,
      "Payment Method": order.payment_method,
      "Order Date": format(new Date(order.created_at), "PPpp"),
      "Items Count": order.items?.length || 0,
    }));
    const wsOrders = XLSX.utils.json_to_sheet(orderData);
    XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");

    // All order items sheet - now includes APR
    const allItems = orders.flatMap((order) => {
      const sorted = (order.items || []).slice().sort((a: any, b: any) => {
        return Number(a.product?.order ?? 0) - Number(b.product?.order ?? 0);
      });
      return sorted.map((item: any, idx: number) => ({
        "Order ID": order.id,
        "S.No": idx + 1,
        "Product Code":
          (item.product as any)?.product_code ||
          (item.product as any)?.code ||
          "-",
        Product: item.product.name,
        Category: item.product.categories.name,
        Quantity: item.quantity,
        Price: item.price,
        APR: (item as any)?.apr_snapshot ?? "-", // cost snapshotted at sale time
        Total: item.total_price,
      }));
    });
    const wsItems = XLSX.utils.json_to_sheet(allItems);
    XLSX.utils.book_append_sheet(wb, wsItems, "All Items");

    // Write file
    XLSX.writeFile(wb, "all-orders.xlsx");
  };

  /**
   * Sends the invoice to the customer on WhatsApp. The dialog builds the
   * PDF, stores it, and opens WhatsApp on the customer's chat with the
   * message and the invoice link -- see WhatsAppShareDialog.
   */
  const handleShareOrder = (order: Order) => {
    const business = businessFromSettings(appSettings);
    const number = order.short_id || order.id.slice(0, 8);
    const grand = Number(order.total_amount || 0) - Number(order.discount_amt || 0);
    setShareRequest({
      kind: "invoice",
      title: `Invoice ${number}`,
      customerName: order.full_name,
      phone: order.phone,
      fileName: documentFileName("invoice", number),
      message:
        `Hello ${order.full_name || ""}, thank you for your order with ${business.name}. ` +
        `Order ${number}, grand total Rs. ${grand.toFixed(2)}.`,
      makePdf: async () => {
        const lines = (order.items || [])
          .slice()
          .sort(
            (a: any, b: any) =>
              Number(a.product?.order ?? 0) - Number(b.product?.order ?? 0)
          )
          .map((item: any) => ({
            code: item.product?.product_code ?? null,
            name: item.product?.name ?? "Item",
            quantity: Number(item.quantity || 0),
            price: Number(item.price || 0),
            total: Number(item.total_price || 0),
          }));
        const pdf = await buildDocumentPdf({
          kind: "invoice",
          number,
          date: order.created_at,
          status: order.status,
          customer: {
            name: order.full_name,
            phone: order.phone,
            email: order.email,
            address: order.address,
            city: order.city,
            district: (order as any).district,
            state: order.state,
            pincode: order.pincode,
          },
          lines,
          subtotal: Number(order.total_amount || 0),
          discount: Number(order.discount_amt || 0),
          paymentMethod: order.payment_method,
          business,
        });
        return pdf.output("blob");
      },
    });
  };

  const handleInvoicePrint = (order: Order) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const invoiceContent = InvoiceTemplate({
      order,
      business: businessFromSettings(appSettings),
    });
    printWindow.document.open();
    printWindow.document.write(invoiceContent);
    printWindow.document.close();

    // cleanup function to close window and remove listeners/timeouts
    const cleanup = () => {
      try {
        if (!printWindow.closed) printWindow.close();
      } catch (e) {
        /* ignore */
      }
    };

    // ensure window closes after print or if user cancels
    try {
      printWindow.onafterprint = cleanup;
      printWindow.addEventListener?.("beforeunload", cleanup);
      printWindow.addEventListener?.("afterprint", cleanup);
    } catch (e) {
      /* ignore */
    }

    const doPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (e) {
        console.error("Print failed:", e);
      }
    };

    // Start printing after load, fallback to timeout
    if (printWindow.document.readyState === "complete") {
      doPrint();
    } else {
      printWindow.onload = doPrint;
      setTimeout(doPrint, 800);
    }

    // Safety close in case afterprint doesn't fire
    setTimeout(cleanup, 20000);
  };


  const handlePrint = (order: Order) => {
    // compute totals
    const totalProducts = order.items?.length || 0;
    const totalQuantity =
      order.items?.reduce((sum, it) => sum + (it.quantity || 0), 0) || 0;

    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Generate print content
    const sortedItems = (order.items || []).slice().sort((a: any, b: any) => Number(a.product?.order ?? 0) - Number(b.product?.order ?? 0));
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order ${order.short_id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #FF5722; }
          .cus-info{ display: flex; gap: 50px; justify-content: space-between; }
          .logo { height: 100px; }
          .invoice-details { text-align: right; }
          h1 { color: #FF5722; }
          .section { margin-bottom: 20px; }
          .items-header { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:8px; }
          .totals { font-size: 0.95rem; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .total { text-align: right; font-size: 1.2em; margin-top: 20px; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/assets/img/logo/logo_2.png" alt="SoundWave Crackers" class="logo" />
          <div class="invoice-details">
            <h2>Order Summary</h2>
            <p>Order ID: ${order.short_id || order.id}</p>
            <p>Date: ${format(new Date(order.created_at), "PPpp")}</p>
            <p>Status: ${order.status}</p>
            <p><strong>Payment Method:</strong> ${order.payment_method}</p>
          </div>
        </div>
        <div class="cus-info">
          <div class="section">
            <h2>Customer Information</h2>
            <p><strong>Name:</strong> ${order.full_name}</p>
            <p><strong>Email:</strong> ${order.email}</p>
            <p><strong>Phone:</strong> ${order.phone}</p>
            <p><strong>Alternate Phone:</strong> ${order.alternate_phone || "-"}</p>
          </div>
          <div class="section">
            <h2>Shipping Address</h2>
            <p>${order.address}</p>
            <p>${order.city}, ${order.state}</p>
            <p>PIN: ${order.pincode}</p>
          </div>
        </div>

        <div class="section">
          <div class="items-header">
            <h2>Order Items</h2>
            <div class="totals">
              <div><strong>Total Products:</strong> ${totalProducts}</div>
              <div><strong>Total Quantity:</strong> ${totalQuantity}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Product Code</th>
                <th>Product</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Price</th>
           
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${sortedItems
                .map(
                  (item: any, index: number) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${(item.product as any)?.product_code || (item.product as any)?.code || "-"}</td>
                  <td>${item.product.name}</td>
                  <td>${item.product.categories.name}</td>
                  <td>${item.quantity}</td>
                  <td>₹${item.price}</td>
                 
                  <td>₹${item.total_price}</td>
                </tr>
              `
                )
                .join("")}
              ${
                (order.discount_amt ?? 0) > 0
                  ? ` 
                <tr>
                  <td colspan="6" style="text-align:right;font-weight:bold;">Total Amount:</td>
                  <td style="text-align:right;font-weight:bold;">₹${order.total_amount.toFixed(
                    2
                  )}</td>
                </tr>
                <tr>
                  <td colspan="6" style="text-align:right;font-weight:bold;">Discount:</td>
                  <td style='text-align:right;font-weight:bold;'>-₹${
                    order.discount_amt?.toFixed(2) || "0.00"
                  }</td>
                </tr>`
                  : ""
              }
              <tr>
                <td colspan="6" style="text-align:right;font-weight:bold;">Grand Total:</td>
                <td style="text-align:right;font-weight:bold;">₹${(
                  order.total_amount -
                  (order.discount_amt || 0)
                ).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          <p>Thank you for shopping with SoundWave Crackers!</p>
          <p>Website: www.soundwavecrackers.com | Email: soundwavecrackers@gmail.com</p>
          <p>Phone: +91 9789794518, +91 9363515184</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(content);
    printWindow.document.close();

    // cleanup function to close window and remove listeners/timeouts
    const cleanup = () => {
      try {
        if (!printWindow.closed) printWindow.close();
      } catch (e) {
        /* ignore */
      }
    };

    try {
      printWindow.onafterprint = cleanup;
      printWindow.addEventListener?.("beforeunload", cleanup);
      printWindow.addEventListener?.("afterprint", cleanup);
    } catch (e) {
      /* ignore */
    }

    const doPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (e) {
        console.error("Print failed:", e);
      }
    };

    if (printWindow.document.readyState === "complete") {
      doPrint();
    } else {
      printWindow.onload = doPrint;
      setTimeout(doPrint, 800);
    }

    // Safety close in case afterprint doesn't fire
    setTimeout(cleanup, 20000);
  };

  const handleStatusFilterClick = (status: string) => {
    setStatusFilter(statusFilter === status ? "all" : status);
  };

  const readyForPackingCount = orders.filter(isReadyForPacking).length;

  const filtersActive =
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    customerFilter !== "all" ||
    searchTerm.trim() !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setCustomerFilter("all");
    setSearchTerm("");
  };

  const matchingOrders = orders.filter(
    (order) =>
      (order.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.alternate_phone
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        order.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.short_id?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === "all" ||
        (statusFilter === READY_FOR_PACKING
          ? isReadyForPacking(order)
          : order.status === statusFilter)) &&
      (paymentFilter === "all" ||
        (order.payment_status || "pending") === paymentFilter) &&
      (customerFilter === "all" ||
        (customerFilter === "guest" ? !order.user_id : !!order.user_id))
  );

  /**
   * A cancelled order is finished business: it holds no stock, nothing is
   * owed on it and nobody is packing it. Leaving them in every list meant
   * scrolling past dead rows to find live ones, so they are kept out unless
   * they are what you asked for — the Cancelled filter, from the dropdown or
   * its tile, shows them and nothing else.
   */
  const showingCancelled = statusFilter === CANCELLED;

  const filteredOrders = (
    showingCancelled
      ? matchingOrders
      : matchingOrders.filter((order) => order.status !== CANCELLED)
  )
    .slice()
    .sort((a, b) => {
      if (sortField === "created_at") {
        return sortDirection === "asc"
          ? new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
          : new Date(b[sortField]).getTime() - new Date(a[sortField]).getTime();
      }
      return sortDirection === "asc"
        ? String(a[sortField]).localeCompare(String(b[sortField]))
        : String(b[sortField]).localeCompare(String(a[sortField]));
    });

  /**
   * Cancelled orders that match everything else being asked for. Searching an
   * order number and getting an empty table, because the order turned out to
   * be cancelled, looks like the order is gone — so the count is offered with
   * a way through to it.
   */
  const hiddenCancelled = showingCancelled
    ? 0
    : matchingOrders.length - filteredOrders.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Order Placed":
        return "bg-blue-500/10 text-blue-500";
      case "Enquiry Received":
        return "bg-sky-500/10 text-sky-600";
      // Confirmation is the point stock is committed, so it reads as a
      // decision taken rather than another step passed.
      case "Order Confirmed":
        return "bg-teal-500/10 text-teal-600";
      case "Packing":
        return "bg-amber-500/10 text-amber-600";
      case "Processing":
        return "bg-yellow-500/10 text-yellow-500";
      case "Shipped":
        return "bg-purple-500/10 text-purple-500";
      case "Dispatched":
        return "bg-orange-500/10 text-orange-500";
      case "Delivered":
        return "bg-green-500/10 text-green-500";
      case "Cancelled":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };


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

  const handleOpenDiscountModal = (order: Order) => {
    setDiscountOrderId(order.id);
    // Initialize logic:
    // If we have a percentage string (e.g. "10"), use it.
    // Else use amount.
    if (order.discount_percentage && Number(order.discount_percentage) > 0) {
      setDiscountType("percentage");
      setDiscountInput(order.discount_percentage);
    } else {
      setDiscountType("amount");
      setDiscountInput(order.discount_amt ?? "");
    }
    setShowDiscountModal(true);
  };

    // When a selectedOrder is opened, present its items ordered by product.order
  const sortedSelectedItems = selectedOrder
    ? (selectedOrder.items || []).slice().sort((a: any, b: any) =>
        Number(a.product?.order ?? 0) - Number(b.product?.order ?? 0)
      )
    : [];
  const selectedTotalProducts = sortedSelectedItems.length;
  const selectedTotalQuantity = sortedSelectedItems.reduce(
    (s, it) => s + (it.quantity || 0),
    0
  );

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-4xl">All Orders</h1>
            <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
              {filteredOrders.length} orders
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <button
              onClick={() => {
                setEditOrder(null);
                setShowEditModal(true);
              }}
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> New Order
            </button>
            <button
              onClick={() => exportAllOrders()}
              className="group flex items-center gap-2 px-4 py-2 bg-card border border-card-border/10 rounded-lg hover:bg-card/80 transition-all hover:border-primary-orange/30 shadow-sm hover:shadow-md"
              title="Download Excel Report"
            >
              <Download className="w-4 h-4 text-primary-orange group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline font-medium text-text/80 group-hover:text-primary-orange">Export</span>
            </button>
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
        </div>




        {/* Order Status Cards. Ready for packing leads: it is the one list
            the godown works from -- confirmed, paid, nothing left to chase. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-4 mb-4">
          <button
            onClick={() => handleStatusFilterClick(READY_FOR_PACKING)}
            title="Confirmed and fully paid"
            className={`p-2 sm:p-4 rounded-lg transition-all text-xs sm:text-base border ${
              statusFilter === READY_FOR_PACKING
                ? "bg-green-600 text-white shadow-lg ring-2 ring-green-600/50 border-green-600"
                : "bg-green-50 dark:bg-green-900/20 border-green-600/30 hover:bg-green-100 dark:hover:bg-green-900/30"
            }`}
          >
            <h3 className="font-montserrat font-bold text-lg flex items-center justify-center gap-1.5">
              <PackageCheck className="w-5 h-5" />
              {readyForPackingCount}
            </h3>
            <p className="text-sm opacity-80">Ready for packing</p>
          </button>
          {ORDER_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => handleStatusFilterClick(status)}
              className={`p-2 sm:p-4 rounded-lg transition-all text-xs sm:text-base ${
                statusFilter === status
                  ? "bg-primary-orange text-white shadow-lg ring-2 ring-primary-orange/50"
                  : "bg-card hover:bg-card/70"
              }`}
            >
              <h3 className="font-montserrat font-bold text-lg">
                {orderStats[status] || 0}
              </h3>
              <p className="text-sm opacity-80">{status}</p>
            </button>
          ))}
        </div>

        {/* Filters. They combine: "Order Confirmed" + "Part paid" is the list
            of confirmed orders still owing money. */}
        <div className="mb-4 sm:mb-6 rounded-xl border border-card-border/10 bg-card/50 px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text/70 shrink-0">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              <option value="all">Any status</option>
              <option value={READY_FOR_PACKING}>Ready for packing</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}
              aria-label="Filter by payment"
              className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              <option value="all">Any payment</option>
              <option value="pending">Unpaid</option>
              <option value="partial">Part paid</option>
              <option value="received">Paid</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value as typeof customerFilter)}
              aria-label="Filter by customer type"
              className="px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              <option value="all">All customers</option>
              <option value="guest">Guest orders</option>
              <option value="registered">Registered customers</option>
            </select>
          </div>
          <div className="flex items-center gap-3 md:ml-auto">
            {/* Counts the rows actually on screen. `orders.length` would
                include the cancelled ones that are being held back. */}
            <span className="text-sm text-text/60">
              {filtersActive
                ? `Showing ${filteredOrders.length} of ${orders.length}`
                : `${filteredOrders.length} orders`}
            </span>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-card border border-card-border/10 hover:bg-card/70 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {hiddenCancelled > 0 && (
          <p className="-mt-2 mb-4 text-sm text-text/60">
            {hiddenCancelled} cancelled{" "}
            {hiddenCancelled === 1 ? "order is" : "orders are"} not shown.{" "}
            <button
              onClick={() => setStatusFilter(CANCELLED)}
              className="text-primary-orange font-semibold hover:underline"
            >
              Show cancelled
            </button>
          </p>
        )}

        <div className="bg-card/30 rounded-xl overflow-hidden border border-card-border/10 w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-3 px-3 sm:px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("id")}
                    >
                      <span className="whitespace-nowrap">Order ID</span>
                      {sortField === "id" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : (
                          <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-3 px-3 sm:px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("full_name")}
                    >
                      <span>Customer</span>
                      {sortField === "full_name" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : (
                          <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-3 px-3 sm:px-6 text-left">Contact</th>
                  <th className="py-3 px-3 sm:px-6 text-left">Status</th>
                  <th className="py-3 px-3 sm:px-6 text-right whitespace-nowrap">Amount</th>
                  <th className="py-3 px-3 sm:px-6 text-left whitespace-nowrap">Payment</th>
                  <th className="py-3 px-3 sm:px-6 text-right whitespace-nowrap">Disc. Amt</th>
                  <th className="py-3 px-3 sm:px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("created_at")}
                    >
                      <span>Date</span>
                      {sortField === "created_at" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : (
                          <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-3 px-3 sm:px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-text/60">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-card-border/10"
                    >
                      <td
                        className="py-3 px-3 sm:px-6 font-mono text-xs sm:text-sm whitespace-nowrap cursor-help"
                        title={order.short_id || order.id}
                      >
                        {/* The last 4 are the year's sequence, which is what
                            anyone scanning the list goes by; the full number
                            is on hover. Old SWC-### numbers are short enough
                            to show whole. */}
                        {order.short_id
                          ? order.short_id.length > 8
                            ? `SWC…${order.short_id.slice(-4)}`
                            : order.short_id
                          : order.id.slice(0, 8) + "…"}
                      </td>
                      <td className="py-3 px-3 sm:px-6 min-w-[150px]">
                        {order.full_name}
                        {/* Worth seeing at a glance: a guest order has no
                            account to chase up, only the phone on the row. */}
                        {!order.user_id && (
                          <span className="ml-2 align-middle px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                            GUEST
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-6 min-w-[150px]">
                        <div>
                          {/* The number on the order is how this customer
                              gets chased — a guest has no account behind it.
                              Tapping it should dial, not select text to copy
                              into the phone app by hand. */}
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {order.phone ? (
                              <>
                                <a
                                  href={`tel:${order.phone.replace(/\s+/g, "")}`}
                                  title={`Call ${order.phone}`}
                                  className="text-xs sm:text-sm hover:text-primary-orange transition-colors"
                                >
                                  {order.phone}
                                </a>
                                {whatsappNumber(order.phone) && (
                                  <a
                                    href={webChatUrl(
                                      whatsappNumber(order.phone),
                                      statusUpdateMessage(order, business)
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`WhatsApp ${order.full_name || order.phone} a status update`}
                                    aria-label={`Send ${order.full_name || order.phone} a status update on WhatsApp`}
                                    className="text-green-600 hover:text-green-500 transition-colors shrink-0"
                                  >
                                    <FaWhatsapp className="w-4 h-4" />
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-xs sm:text-sm text-text/50">-</span>
                            )}
                          </div>
                          <p className="text-xs text-text/60 truncate max-w-[100px]">{order.city}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 sm:px-6">
                        {/* The status can only move once the order is
                            confirmed. Before that there is one decision --
                            confirm it (which checks and takes the stock) or
                            cancel it -- so that is all the cell offers. */}
                        {order.status === "Enquiry Received" ? (
                          <div className="flex flex-col gap-1.5 items-start">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(order.status)}`}
                            >
                              {order.status}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleStatusChange(order.id, "Order Confirmed")}
                                disabled={updatingStatus}
                                title="Check stock, deduct it, and confirm the order"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Confirm order
                              </button>
                              <button
                                onClick={() => handleStatusChange(order.id, "Cancelled")}
                                disabled={updatingStatus}
                                title="Cancel this enquiry"
                                className="px-2 py-1 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : order.status === "Cancelled" ? (
                          <div className="flex flex-col gap-1.5 items-start">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(order.status)}`}
                            >
                              {order.status}
                            </span>
                            <button
                              onClick={() => handleStatusChange(order.id, "Enquiry Received")}
                              disabled={updatingStatus}
                              title="Back to an enquiry; it will need confirming again"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-text/70 hover:bg-card/70 disabled:opacity-50 whitespace-nowrap"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Reopen
                            </button>
                          </div>
                        ) : (
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleStatusChange(order.id, e.target.value)
                            }
                            disabled={updatingStatus}
                            className={`px-2 py-1 rounded-full text-xs ${getStatusColor(
                              order.status
                            )} bg-opacity-10 border-0 focus:outline-none focus:ring-2 focus:ring-primary-orange max-w-[120px] sm:max-w-none`}
                          >
                            {(CONFIRMED_NEXT.includes(order.status)
                              ? CONFIRMED_NEXT
                              : // A status from before the workflow: show it
                                // so the row reads true, and offer the rest.
                                [order.status, ...CONFIRMED_NEXT]
                            ).map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-right whitespace-nowrap">
                        ₹{order.total_amount.toFixed(2)}
                      </td>
                      {/* Payment stands on its own: an order can be paid for
                          while still being packed, or shipped before the
                          balance arrives. */}
                      <td className="py-3 px-3 sm:px-6 whitespace-nowrap">
                        {(() => {
                          const received = Number(order.amount_received || 0);
                          const balance =
                            Number(order.total_amount || 0) - received;
                          const state =
                            PAYMENT_LABELS[order.payment_status || "pending"] ??
                            PAYMENT_LABELS.pending;

                          return (
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${state.className}`}
                              >
                                {state.label}
                              </span>
                              <div className="leading-tight">
                                <p className="text-xs">
                                  ₹{received.toFixed(2)}
                                </p>
                                {balance > 0.01 && (
                                  <p className="text-[11px] text-red-600">
                                    ₹{balance.toFixed(2)} due
                                  </p>
                                )}
                              </div>
                              {/* Shown only while there is money to collect:
                                  not on a cancelled order, and not once the
                                  order is fully paid. */}
                              {["admin", "superadmin"].includes(
                                userRole?.name || ""
                              ) &&
                                order.status !== "Cancelled" &&
                                order.payment_status !== "received" &&
                                balance > 0.01 && (
                                  <button
                                    onClick={() => openPaymentModal(order)}
                                    title="Record a payment received"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap border-green-600/40 text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                                  >
                                    <IndianRupee className="w-3.5 h-3.5" />
                                    Mark payment
                                  </button>
                                )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-right whitespace-nowrap">
                        ₹{(order.discount_amt || 0).toFixed(2)}
                      </td>
                      {/* Date over time rather than side by side: the time
                          tells two orders on the same day apart, and this
                          column is already the widest thing that is not the
                          customer's name. */}
                      <td className="py-3 px-3 sm:px-6 whitespace-nowrap">
                        <div>
                          {format(new Date(order.created_at), "MMM dd, yyyy")}
                        </div>
                        <div className="text-xs text-text/60">
                          {format(new Date(order.created_at), "h:mm a")}
                        </div>
                      </td>
                      <td className="py-3 px-3 sm:px-6">
                        <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-1 sm:p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="View Order Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Replace print button with discount button for superadmin */}
                          {userRole?.name === "superadmin" && (
                            <button
                              onClick={() => handleOpenDiscountModal(order)}
                              className="p-1 sm:p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                              title="Add/Edit Discount"
                            >
                              <Percent className="w-4 h-4" />
                            </button>
                          )}
                          {/* Profit, as a symbol: green up for a gain, red
                              down for a loss, the figure on hover and the
                              breakdown on click. Superadmin only. */}
                          {userRole?.name === "superadmin" &&
                            (() => {
                              const { profit } = computeProfitBreakdown(order);
                              const loss = profit < 0;
                              const Icon = loss ? TrendingDown : TrendingUp;
                              return (
                                <button
                                  onClick={() => handleShowProfit(order)}
                                  className={`p-1 sm:p-2 hover:bg-card/70 rounded-lg transition-colors ${
                                    loss ? "text-red-600" : "text-green-600"
                                  }`}
                                  title={`Profit ₹${profit.toFixed(2)} — click for breakdown`}
                                  aria-label={`Profit ${profit.toFixed(2)}`}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })()}
                          <RowActionsMenu
                            label={`More actions for ${order.short_id || "order"}`}
                            actions={[
                              {
                                label: "Print invoice",
                                icon: <ReceiptText className="w-4 h-4" />,
                                onClick: () => handleInvoicePrint(order),
                              },
                              {
                                label: "Share on WhatsApp",
                                icon: <MessageCircle className="w-4 h-4" />,
                                onClick: () => handleShareOrder(order),
                              },
                              {
                                label: "Edit order",
                                icon: <Pencil className="w-4 h-4" />,
                                onClick: () => setEditOrder(order),
                                hidden: userRole?.name !== "superadmin",
                              },
                              {
                                label: "Download",
                                icon: <Download className="w-4 h-4" />,
                                onClick: () => exportOrder(order),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Record payment. Confirmed explicitly, because money received is not
          something to correct casually afterwards. */}
      {paymentOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl max-w-md w-full p-6">
            <h2 className="font-heading text-2xl mb-1">Record payment</h2>
            <p className="text-sm text-text/70 mb-4">
              Order{" "}
              <span className="font-mono">
                {paymentOrder.short_id || paymentOrder.id.slice(0, 8)}
              </span>{" "}
              — {paymentOrder.full_name}
            </p>

            <div className="bg-card/40 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-text/70">Order total</span>
                <span>₹{Number(paymentOrder.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text/70">Already received</span>
                <span>
                  ₹{Number(paymentOrder.amount_received || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Outstanding</span>
                <span className="text-primary-orange">
                  ₹
                  {(
                    Number(paymentOrder.total_amount) -
                    Number(paymentOrder.amount_received || 0)
                  ).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Amount received *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange no-spinner"
                />
                {/* Part payments are normal here: an advance now, the
                    balance on delivery. A refund is a negative amount. */}
                <p className="text-xs text-text/50 mt-1">
                  Part payments are fine. Use a negative amount for a refund.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Method
                  </label>
                  <select
                    value={paymentMethodInput}
                    onChange={(e) => setPaymentMethodInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Reference
                  </label>
                  <input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="UPI ref / cheque no."
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Note</label>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange"
                />
              </div>
            </div>

            {paymentError && (
              <p className="mt-3 text-sm text-red-600">{paymentError}</p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setPaymentOrder(null)}
                disabled={savingPayment}
                className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={savingPayment || !paymentAmount}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
              >
                {savingPayment && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>
                  {savingPayment
                    ? "Recording…"
                    : `Confirm ₹${Number(paymentAmount || 0).toFixed(2)} received`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background z-10 flex items-center justify-between p-6 border-b border-card-border/10">
              <div className="flex items-start sm:items-center gap-4">
                <h2 className="font-heading text-2xl">Order Details</h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-text/60">
                  <span className="bg-card/30 px-3 py-1 rounded-md">Total Products: <strong className="text-primary-orange ml-1">{selectedTotalProducts}</strong></span>
                  <span className="bg-card/30 px-3 py-1 rounded-md">Total Quantity: <strong className="text-primary-orange ml-1">{selectedTotalQuantity}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handlePrint(selectedOrder)}
                  className="p-2 hover:bg-card/50 rounded-lg transition-colors"
                  title="Print Order Summary"
                >
                  <Printer className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-card/50 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Order Items */}
              <div className="bg-card/30 rounded-lg overflow-auto mb-8">
                <table className="w-full">
                  <thead>
                    <tr className="bg-card/50">
                      <th className="py-3 px-4 text-left">S.No</th>
                      <th className="py-3 px-4 text-left">Code</th>
                      <th className="py-3 px-4 text-left">Product</th>
                      <th className="py-3 px-4 text-left">Category</th>
                      <th className="py-3 px-4 text-center">Quantity</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      {/* <th className="py-3 px-4 text-right">APR</th> */}
                      <th className="py-3 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSelectedItems?.map((item, index) => (
                      <tr
                        key={item.id}
                        className="border-t border-card-border/10"
                      >
                        <td className="py-3 px-4">{index + 1}</td>
                        <td className="py-3 px-4">
                          {item.product?.product_code || "-"}
                        </td>
                        <td className="py-3 px-4">{item.product.name}</td>
                        <td className="py-3 px-4">
                          {item.product.categories.name}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right">₹{item.price}</td>
                        {/* <td className="py-3 px-4 text-right">₹{(item.product as any)?.apr}</td> */}
                        <td className="py-3 px-4 text-right">
                          ₹{item.total_price}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-card-border/10 bg-card/50">
                      <td
                        colSpan={6}
                        className="py-3 px-4 text-right font-bold"
                      >
                        Total Amount:
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        ₹{selectedOrder.total_amount}
                      </td>
                    </tr>

                    <tr className="border-t border-card-border/10 bg-card/50">
                      <td
                        colSpan={6}
                        className="py-3 px-4 text-right font-bold"
                      >
                        Discount:
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-green-700">
                        -₹{(selectedOrder.discount_amt ?? 0).toFixed(2)}
                      </td>
                    </tr>

                    <tr className="border-t border-card-border/10 bg-card/50">
                      <td
                        colSpan={6}
                        className="py-3 px-4 text-right font-bold"
                      >
                        Grand Total:
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        ₹
                        {(
                          selectedOrder.total_amount -
                          (selectedOrder.discount_amt || 0)
                        ).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-montserrat font-bold text-lg mb-4">
                    Customer Details
                  </h3>
                  <div className="space-y-2">
                    <p>
                      <span className="text-text/60">Name:</span>{" "}
                      {selectedOrder.full_name}
                    </p>
                    <p>
                      <span className="text-text/60">Email:</span>{" "}
                      {selectedOrder.email}
                    </p>
                    <p>
                      <span className="text-text/60">Phone:</span>{" "}
                      {`${selectedOrder.phone}, ${
                        selectedOrder.alternate_phone || ""
                      }`}
                    </p>
                    <p>
                      <span className="text-text/60">Referral:</span>{" "}
                      {selectedOrder.referred_by || ""}
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="font-montserrat font-bold text-lg mb-4">
                    Delivery Address
                  </h3>
                  <div className="space-y-2">
                    <p>{selectedOrder.address}</p>
                    <p>
                      {selectedOrder.city}, {selectedOrder.state}
                    </p>
                    <p>PIN: {selectedOrder.pincode}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & LR Number Modal */}
      {showConfirmModal && pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
              onClick={handleCancelModal}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-center">
              Confirm Status Change
            </h2>
            <p className="mb-4 text-center">
              Are you sure you want to change the status to{" "}
              <span className="font-semibold text-primary-orange">
                {pendingStatus.newStatus}
              </span>
              ?
            </p>
            {/* The two changes that move stock say so before they happen. */}
            {pendingStatus.newStatus === "Order Confirmed" && (
              <p className="mb-4 text-sm text-center text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
                Stock is checked and deducted for every item in this order,
                including the products inside any family pack.
              </p>
            )}
            {pendingStatus.newStatus === "Cancelled" && (
              <p className="mb-4 text-sm text-center text-red-700 bg-red-50 rounded-lg px-3 py-2">
                Any stock this order holds is returned.
              </p>
            )}
            {pendingStatus.newStatus === "Shipped" && (
              <div className="mb-4">
                <label className="block mb-2 font-medium">
                  Enter LR Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={lrNumber}
                  onChange={(e) => {
                    setLRNumber(e.target.value);
                    setLRError("");
                  }}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:border-primary-orange"
                  placeholder="LR Number"
                  required
                />
              </div>
            )}
            {/* Shown for every status, not only Shipped: a confirmation
                refused for lack of stock reports here, and used to vanish. */}
            {lrError && (
              <div className="text-red-600 text-sm mb-2 bg-red-50 rounded-lg px-3 py-2">
                {lrError}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                onClick={handleCancelModal}
                disabled={updatingStatus}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-primary-orange text-white hover:bg-primary-orange/90"
                onClick={handleConfirmStatusChange}
                disabled={updatingStatus}
              >
                {updatingStatus ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal for Superadmin */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
              onClick={() => setShowDiscountModal(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-center">
              Set Discount
            </h2>

            {/* Toggle Amount / Percentage */}
            <div className="flex justify-center mb-4 space-x-4">
              <button
                onClick={() => setDiscountType("amount")}
                className={`px-3 py-1 rounded-full text-sm border ${
                  discountType === "amount"
                    ? "bg-primary-orange text-white border-primary-orange"
                    : "bg-white text-gray-700 border-gray-300"
                }`}
              >
                ₹ Amount
              </button>
              <button
                onClick={() => setDiscountType("percentage")}
                className={`px-3 py-1 rounded-full text-sm border ${
                  discountType === "percentage"
                    ? "bg-primary-orange text-white border-primary-orange"
                    : "bg-white text-gray-700 border-gray-300"
                }`}
              >
                % Percentage
              </button>
            </div>

            <input
              type="number"
              min={0}
              step="0.01"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg mb-2"
              placeholder={
                discountType === "amount"
                  ? "Enter calculated amount"
                  : "Enter percentage (e.g. 10)"
              }
              disabled={savingDiscount}
            />

            {/* Calculated Preview */}
            <div className="mb-4 text-sm text-center text-gray-600 bg-gray-50 p-3 rounded">
              <p>
                Order Total: ₹
                {orders
                  .find((o) => o.id === discountOrderId)
                  ?.total_amount.toFixed(2) || "0.00"}
              </p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                <span>Discount Value:</span>
                <span className="font-bold text-primary-orange">
                  -₹
                  {discountType === "percentage"
                    ? (
                        ((orders.find((o) => o.id === discountOrderId)
                          ?.total_amount || 0) *
                          (Number(discountInput) || 0)) /
                        100
                      ).toFixed(2)
                    : (Number(discountInput) || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span>New Total:</span>
                <span className="font-bold">
                  ₹
                  {(
                    (orders.find((o) => o.id === discountOrderId)
                      ?.total_amount || 0) -
                    (discountType === "percentage"
                      ? ((orders.find((o) => o.id === discountOrderId)
                          ?.total_amount || 0) *
                          (Number(discountInput) || 0)) /
                        100
                      : Number(discountInput) || 0)
                  ).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => setShowDiscountModal(false)}
                disabled={savingDiscount}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-primary-orange text-white hover:bg-primary-orange/90"
                onClick={async () => {
                  if (!discountOrderId) return;
                  setSavingDiscount(true);
                  try {
                    const currentOrder = orders.find(
                      (o) => o.id === discountOrderId
                    );
                    if (!currentOrder) throw new Error("Order not found");

                    let finalAmt = 0;
                    let finalPercent = null;

                    if (discountType === "percentage") {
                      const pct = Number(discountInput) || 0;
                      finalPercent = pct.toString(); // store string
                      finalAmt = (currentOrder.total_amount * pct) / 100;
                    } else {
                      finalAmt = Number(discountInput) || 0;
                      finalPercent = null; 
                    }

                    const { error } = await supabase
                      .from("orders")
                      .update({
                        discount_amt: finalAmt,
                        discount_percentage: finalPercent,
                      })
                      .eq("id", discountOrderId);
                    if (error) throw error;

                    // Update UI
                    setOrders((orders) =>
                      orders.map((o) =>
                        o.id === discountOrderId
                          ? {
                              ...o,
                              discount_amt: finalAmt,
                              // Add this if your Order type interface has this field, else just ignore
                              discount_percentage: finalPercent as any,
                            }
                          : o
                      )
                    );
                    if (selectedOrder?.id === discountOrderId) {
                      setSelectedOrder({
                        ...selectedOrder,
                        discount_amt: finalAmt,
                        discount_percentage: finalPercent as any,
                      });
                    }

                    setShowDiscountModal(false);
                    setDiscountOrderId(null);
                    setDiscountInput("");
                  } catch (err) {
                    alert("Failed to update discount");
                  } finally {
                    setSavingDiscount(false);
                  }
                }}
                disabled={savingDiscount}
              >
                {savingDiscount ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profit Modal (Superadmin) */}
      {profitModalOrder && profitBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
              onClick={handleCloseProfit}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-center">Order Profit</h2>
            <div className="space-y-3">
              <p><strong>Order:</strong> {profitModalOrder.short_id || profitModalOrder.id}</p>
              <p><strong>Revenue:</strong> ₹{profitBreakdown.revenue.toFixed(2)}</p>
              <p><strong>Cost (APR):</strong> ₹{profitBreakdown.cost.toFixed(2)}</p>
              <p><strong>Discount:</strong> ₹{profitBreakdown.discount.toFixed(2)}</p>
              <p className="text-lg font-bold">Profit: ₹{profitBreakdown.profit.toFixed(2)}</p>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={handleCloseProfit}
                className="px-4 py-2 rounded bg-primary-orange text-white hover:bg-primary-orange/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Edit Order Modal */}
            {(editOrder || showEditModal) && (
              <EditOrderModal
                order={editOrder || {
                  id: "",
                  created_at: new Date().toISOString(),
                  full_name: "",
                  email: "",
                  phone: "",
                  address: "",
                  city: "",
                  state: "",
                  pincode: "",
                  total_amount: 0,
                  status: "Enquiry Received",
                  items: [],
                } as OrderForEdit}
                onClose={() => {
                  setEditOrder(null);
                  setShowEditModal(false);
                }}
                onSaved={async (updated) => {
                  try {
                    // Refetch the single order to get full relation data (products, categories, etc.)
                    const { data: freshOrder, error } = await supabase
                      .from("orders")
                      .select(
                        `
                      *,
                      items:order_items (
                        *,
                        product:products (
                          id,
                          name,
                          product_code,
                          categories:categories ( name )
                        ),
                        pack:combo_packs ( id, name, pack_code )
                      )
                    `
                      )
                      .eq("id", updated.id)
                      .single();

                    if (error) throw error;
                    attachPackDetails([freshOrder] as any[]);
                    if (freshOrder) {
                       setOrders((orders) =>
                        orders.map((o) => (o.id === freshOrder.id ? freshOrder : o))
                      );
                      if (selectedOrder?.id === freshOrder.id) {
                        setSelectedOrder(freshOrder);
                      }
                    }
                  } catch (e) {
                    console.error("Failed to refresh order after edit:", e);
                    // Fallback to local update if fetch fails
                     const updatedOrder = updated as Order;
                     setOrders((orders) =>
                       orders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
                     );
                  }
                  
                  setEditOrder(null);
                  setShowEditModal(false);
                }}
              />
            )}
      
      <WhatsAppShareDialog
        request={shareRequest}
        onClose={() => setShareRequest(null)}
      />
          </div>
        );
      }
