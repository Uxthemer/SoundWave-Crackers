import { useState, useEffect } from "react";
import { fetchOrders, supabase } from "../lib/supabase";
import {
  getRememberedGuestOrder,
  trackGuestOrder,
  trackGuestOrderItems,
} from "../lib/guestOrders";
import { useAppSettings } from "../context/AppSettingsContext";
import { businessFromSettings } from "../lib/businessDetails";
import {
  buildDocumentPdf,
  documentFileName,
  type BusinessDocument,
} from "../lib/documentPdf";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export function TrackOrder() {
  const [input, setInput] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("");
  // Guests identify themselves with the order number AND the phone on the
  // order. Order numbers run in sequence, so one on its own would let anybody
  // read every order ever placed.
  const [phone, setPhone] = useState("");
  const [checkedSession, setCheckedSession] = useState(false);
  // Which order's PDF is being built, so only that card shows a spinner.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { settings } = useAppSettings();

  useEffect(() => {
    // Fetch user and role
    (async () => {
      const session = await supabase.auth.getSession();
      const currentUser = session.data?.session?.user;
      setUser(currentUser);
      setCheckedSession(true);

      // A guest who just ordered on this device gets both fields filled in
      // for them; they arrived here straight from the confirmation.
      if (!currentUser) {
        const remembered = getRememberedGuestOrder();
        if (remembered) {
          setInput(remembered.short_id);
          setPhone(remembered.phone);
        }
      }

      if (currentUser) {
        // Fetch user profile to get role
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role_id")
          .eq("user_id", currentUser.id)
          .single();
        if (profile?.role_id) {
          const { data: role } = await supabase
            .from("roles")
            .select("name")
            .eq("id", profile.role_id)
            .single();
          setUserRole(role?.name || "");
        }
      }
    })();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOrders([]);

    if (!input.trim()) {
      setError("Please enter your Order ID or Phone Number.");
      return;
    }

    setLoading(true);

    try {
      // --- guest lookup -----------------------------------------------------
      // No session: the order number and the phone number on it must both
      // match. The order number may be just its last four digits — that is
      // what customers read off their confirmation — because the phone number
      // is what actually proves the order is theirs. The query runs in the
      // database, which returns only the delivery and status columns a
      // customer already has.
      if (!user) {
        if (!phone.trim()) {
          setError("Please enter the mobile number used on the order.");
          return;
        }
        const found = await trackGuestOrder(input, phone);
        if (!found.length) {
          setError(
            "No order found. Check the last 4 digits of the order number and the mobile number you ordered with."
          );
        } else {
          setOrders(found);
        }
        return;
      }

      // --- signed-in lookup, unchanged --------------------------------------
      const data = await fetchOrders(input);

      // Only admin/superadmin can see all orders
      if (userRole === "admin" || userRole === "superadmin") {
        setOrders(data);
      } else {
        // Filter orders to only those belonging to the current user
        const myOrders = data.filter((order: any) => order.user_id === user.id);
        if (!myOrders.length) {
          setError("No orders found for the given input.");
        } else {
          setOrders(myOrders);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not look up that order."
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * The same order summary PDF checkout hands over, rebuilt from the order.
   *
   * The lines come back from the database keyed on the order's own phone
   * number, so a guest and a signed-in customer take the same path.
   */
  const handleDownloadSummary = async (order: any) => {
    setDownloadingId(order.id);
    try {
      const lines = await trackGuestOrderItems(order.id, order.phone || phone);
      if (!lines.length) {
        toast.error("No items found on this order.");
        return;
      }

      const subtotal = lines.reduce(
        (sum, line) => sum + Number(line.total_price || 0),
        0
      );
      const total = Number(order.total_amount ?? subtotal);
      const summary: BusinessDocument = {
        kind: "order",
        number: order.short_id || String(order.id).slice(0, 8),
        date: order.created_at || new Date(),
        status: order.status ?? null,
        customer: {
          name: order.full_name || "Customer",
          phone: order.phone,
          email: order.email ?? null,
          address: order.address,
          city: order.city,
          district: order.district,
          state: order.state,
          pincode: order.pincode,
        },
        lines: lines.map((line) => ({
          code: line.code ?? null,
          name: line.name,
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
          total: Number(line.total_price || 0),
        })),
        subtotal,
        // What the order was actually billed at, shown as a discount rather
        // than a total that silently disagrees with the lines above it.
        discount: subtotal > total ? subtotal - total : 0,
        paymentMethod: order.payment_method ?? null,
        business: businessFromSettings(settings),
      };

      const pdf = await buildDocumentPdf(summary);
      pdf.save(documentFileName("order", summary.number));
    } catch (err) {
      console.error("Order summary PDF failed", err);
      toast.error(
        err instanceof Error ? err.message : "Could not download the summary"
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-background">
      <div className="container mx-auto px-4 max-w-lg">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
          Track Your Order
        </h1>
        <div className="mb-6 text-center text-text/70 text-sm sm:text-base">
          {!checkedSession
            ? " "
            : user
            ? "Enter an Order ID or the phone number on your order."
            : "Enter the last 4 digits of your order number, along with the mobile number you ordered with."}
        </div>
        <form onSubmit={handleSearch} className="flex flex-col gap-4 mb-8">
          <input
            type="text"
            placeholder={
              user
                ? "Enter Order ID or Phone Number"
                : "Last 4 digits of the order number, e.g. 0001"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="px-4 py-3 rounded-lg border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange"
          />
          {/* Only guests are asked for the phone: a signed-in customer is
              already identified by their session. */}
          {checkedSession && !user && (
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Mobile number used on the order"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="px-4 py-3 rounded-lg border border-card-border/20 bg-card focus:outline-none focus:border-primary-orange"
            />
          )}
          <button
            type="submit"
            className="btn-primary flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Track Order
          </button>
        </form>
        {error && <div className="mb-6 text-red-600 text-center">{error}</div>}
        {orders.length > 0 && (
          <div className="space-y-6">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-card rounded-xl p-4 sm:p-6 shadow flex flex-col gap-2"
              >
                <div className="flex justify-between items-center gap-3">
                  <span className="font-bold">Order ID:</span>
                  <span className="font-mono text-sm break-all text-right">
                    {order.short_id || order.id}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="font-bold">Phone:</span>
                  <span>{order.phone}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="font-bold">Status:</span>
                  <span className="text-primary-orange font-semibold">
                    {order.status}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="font-bold">Placed On:</span>
                  <span className="text-right">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </div>
                {order.total_amount != null && (
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-bold">Total:</span>
                    <span>₹{Number(order.total_amount).toFixed(2)}</span>
                  </div>
                )}
                {/* The customer leaves with the same summary the checkout
                    downloaded for them, however long ago that was. */}
                <button
                  type="button"
                  onClick={() => handleDownloadSummary(order)}
                  disabled={downloadingId === order.id}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-primary-orange text-primary-orange font-semibold hover:bg-primary-orange hover:text-white transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {downloadingId === order.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloadingId === order.id
                    ? "Preparing…"
                    : "Download Order Summary"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
