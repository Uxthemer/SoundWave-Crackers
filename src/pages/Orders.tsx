import { useState, useEffect } from "react";
import { ReceiptText, Percent, Printer, Loader2, Eye, Download, X, Search, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { InvoiceTemplate } from "../components/InvoiceTemplate";
import EditOrderModal from "../components/EditOrderModal";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  total_price: number;
  product: {
    name: string;
    product_code?: string; // added product code
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
}

const ORDER_STATUSES = [
  "Enquiry Received",
  "Payment Completed",
  "Packing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

export function Orders() {
  const { userRole } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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


  // profit modal state (superadmin only)
  const [profitModalOrder, setProfitModalOrder] = useState<Order | null>(null);
  const [profitBreakdown, setProfitBreakdown] = useState<{ revenue: number; cost: number; discount: number; profit: number } | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
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
              "order",
              apr,
              categories:categories ( name )
            )
          )
        `
        )
        .order("created_at", { ascending: false });
       if (error) throw error;
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
    const cost = (order.items || []).reduce((s, it) => {
      const apr = Number((it.product as any)?.apr || 0);
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
      const updateObj: any = { status: pendingStatus.newStatus };
      if (pendingStatus.newStatus === "Shipped") {
        updateObj.lr_number = lrNumber.trim();
      }
      const { error } = await supabase
        .from("orders")
        .update(updateObj)
        .eq("id", pendingStatus.orderId);

      if (error) throw error;

      // If order is cancelled, restore stock for ordered items
      if (pendingStatus.newStatus === "Cancelled") {
        try {
          // fetch order items
          const { data: items, error: itemsError } = await supabase
            .from("order_items")
            .select("product_id, quantity")
            .eq("order_id", pendingStatus.orderId);

          if (itemsError) throw itemsError;

          // aggregate quantities per product
          const qtyMap: Record<string, number> = {};
          (items || []).forEach((it: any) => {
            qtyMap[it.product_id] =
              (qtyMap[it.product_id] || 0) + (it.quantity || 0);
          });

          // update each product stock
          for (const productId of Object.keys(qtyMap)) {
            const addQty = qtyMap[productId];

            const { data: prod, error: prodError } = await supabase
              .from("products")
              .select("stock")
              .eq("id", productId)
              .single();

            if (prodError) {
              console.error(
                "Failed to fetch product for stock restore:",
                prodError
              );
              continue;
            }

            const newStock = Math.max(0, (prod?.stock || 0) + addQty);

            const { error: updateProdError } = await supabase
              .from("products")
              .update({ stock: newStock })
              .eq("id", productId);

            if (updateProdError) {
              console.error("Failed to update product stock:", updateProdError);
            }
          }
        } catch (stockErr) {
          console.error("Error restoring stock for cancelled order:", stockErr);
        }
      }

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
    } catch (error) {
      console.error("Error updating order status:", error);
      setLRError("Failed to update order status. Please try again.");
    } finally {
      setUpdatingStatus(false);
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
      APR: (item.product as any)?.apr ?? "-", // <-- added APR column
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
        APR: (item.product as any)?.apr ?? "-", // <-- added APR column
        Total: item.total_price,
      }));
    });
    const wsItems = XLSX.utils.json_to_sheet(allItems);
    XLSX.utils.book_append_sheet(wb, wsItems, "All Items");

    // Write file
    XLSX.writeFile(wb, "all-orders.xlsx");
  };

  const handleInvoicePrint = (order: Order) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const invoiceContent = InvoiceTemplate({ order });
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

  const filteredOrders = orders
    .filter(
      (order) =>
        (order.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.alternate_phone
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          order.city?.toLowerCase().includes(searchTerm.toLowerCase())) &&
        (statusFilter === "all" || order.status === statusFilter)
    )
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Order Placed":
        return "bg-blue-500/10 text-blue-500";
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
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative">
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
              onClick={() => exportAllOrders()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/80 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export All</span>
            </button>
          </div>
        </div>

        {/* Order Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
          {ORDER_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => handleStatusFilterClick(status)}
              className={`p-2 sm:p-4 rounded-lg transition-all text-xs sm:text-base ${
                statusFilter === status
                  ? "bg-primary-orange text-white scale-105"
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

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] sm:min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("id")}
                    >
                      <span>Order ID</span>
                      {sortField === "id" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("full_name")}
                    >
                      <span>Customer</span>
                      {sortField === "full_name" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-left">Contact</th>
                  <th className="py-4 px-6 text-left">Status</th>
                  <th className="py-4 px-6 text-right">Amount</th>
                  {userRole?.name === "superadmin" && (
                    <th className="py-4 px-6 text-right">Profit</th>
                  )}
                  <th className="py-4 px-6 text-right">Discounted Amount</th>
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort("created_at")}
                    >
                      <span>Date</span>
                      {sortField === "created_at" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-text/60">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-t border-card-border/10"
                    >
                      <td className="py-4 px-6 font-mono text-sm">
                        {order.short_id || order.id}
                      </td>
                      <td className="py-4 px-6">{order.full_name}</td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm">{order.phone}</p>
                          <p className="text-sm text-text/60">{order.city}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value)
                          }
                          disabled={updatingStatus}
                          className={`px-3 py-1 rounded-full text-sm ${getStatusColor(
                            order.status
                          )} bg-opacity-10 border-0 focus:outline-none focus:ring-2 focus:ring-primary-orange`}
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-6 text-right">
                        ₹{order.total_amount.toFixed(2)}
                      </td>
                      {userRole?.name === "superadmin" && (
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleShowProfit(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="View Profit"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                      <td className="py-4 px-6 text-right">
                        ₹{(order.discount_amt || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-6">
                        {format(new Date(order.created_at), "MMM dd, yyyy")}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="View Order Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {userRole?.name === "superadmin" && (
                          <button
                            onClick={() => setEditOrder(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="Edit Order"
                          >
                            <span className="sr-only">Edit</span>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                          </button>
                          )}
                          
                          <button
                            onClick={() => exportOrder(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="Export Order"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {/* Replace print button with discount button for superadmin */}
                          {userRole?.name === "superadmin" && (
                            <button
                              onClick={() => handleOpenDiscountModal(order)}
                              className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                              title="Add/Edit Discount"
                            >
                              <Percent className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleInvoicePrint(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="Print Invoice"
                          >
                            <ReceiptText className="w-4 h-4" />
                          </button>
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
                {lrError && (
                  <div className="text-red-500 text-sm mt-1">{lrError}</div>
                )}
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
            {editOrder && (
              <EditOrderModal
                order={editOrder}
                onClose={() => setEditOrder(null)}
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
                          "order",
                          apr,
                          categories:categories ( name )
                        )
                      )
                    `
                      )
                      .eq("id", updated.id)
                      .single();

                    if (error) throw error;
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
                }}
              />
            )}
      
          </div>
        );
      }
