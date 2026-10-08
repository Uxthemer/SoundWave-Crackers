import { lazy, Suspense, useEffect, useState } from "react";
  import { useQuotations } from "../hooks/useQuotations";
  import { useCartStore } from "../store/cartStore";
  import {
    Eye,
    Pencil,
    Trash2,
    ShoppingCart,
    MessageCircle,
    Loader2,
    ScanLine as ScanIcon,
    X,
  } from "lucide-react";
  import { format } from "date-fns";
  import toast from "react-hot-toast";
  import { useNavigate } from "react-router-dom";
  import { useAppSettings } from "../context/AppSettingsContext";
  import { useAuth } from "../context/AuthContext";
  // Lazy: the scan screen carries the image segmentation and the catalogue
  // matcher, and the great majority of people who open this page are here to
  // look at a quotation, not to photograph one.
  const ScanOrderSheetModal = lazy(() =>
    import("./ScanOrderSheetModal").then((module) => ({
      default: module.ScanOrderSheetModal,
    }))
  );
  import { useSeasons } from "../context/SeasonContext";
  import { supabase } from "../lib/supabase";
  import { createOrder } from "../hooks/useOrders";
  import { businessFromSettings } from "../lib/businessDetails";
  import { buildDocumentPdf, documentFileName } from "../lib/documentPdf";
  import { EditQuotationModal } from "./EditQuotationModal";
  import { cleanDelivery, deliveryProblem } from "../lib/deliveryDetails";
  import {
    WhatsAppShareDialog,
    type WhatsAppShareRequest,
  } from "../components/WhatsAppShareDialog";

  // interface QuotationsListProps {
  //   onOpenCart: () => void;
  // }

  /**
   * The name to show for a quoted line.
   *
   * A pack line has no product row behind it, so its name comes from the
   * pack. Either may be missing if the catalogue has moved on since the quote
   * was saved -- the line still has its quantity and price, which is enough to
   * keep the quotation readable.
   */
  function lineName(item: any): string {
    return (
      item.product?.name ??
      item.pack?.name ??
      (item.combo_pack_id ? "Family pack" : "Product")
    );
  }

  export function QuotationsList() {
    const { quotations, loading, fetchQuotations, saveQuotation, deleteQuotation } = useQuotations();
    const { loadQuotation, openCart } = useCartStore();
    const { settings } = useAppSettings();
    const { activeSeason } = useSeasons();
    const { userRole } = useAuth();
    const navigate = useNavigate();

    // Reading a customer's handwriting and pricing it is a counter job, not a
    // customer-facing one, so it is kept to the two roles that already see
    // every order and every price.
    const canScan = ["admin", "superadmin"].includes(userRole?.name || "");
    const [scanning, setScanning] = useState(false);

    const [shareRequest, setShareRequest] = useState<WhatsAppShareRequest | null>(null);
    // The quotation open in the read-only view, and the one currently being
    // turned into an order.
    const [viewing, setViewing] = useState<any | null>(null);
    const [converting, setConverting] = useState<string | null>(null);
    // The quotation open in the edit popup.
    const [editing, setEditing] = useState<any | null>(null);

    /** Sends the quotation on WhatsApp; see WhatsAppShareDialog. */
    const handleShare = (quote: any) => {
      const business = businessFromSettings(settings);
      const number = quote.short_id || String(quote.id).slice(0, 8);
      setShareRequest({
        kind: "quotation",
        title: `Quotation ${number}`,
        customerName: quote.customer_name,
        phone: quote.phone,
        fileName: documentFileName("quotation", number),
        message:
          `Hello ${quote.customer_name || ""}, here is your quotation ${number} ` +
          `from ${business.name}. Total Rs. ${Number(quote.total_amount || 0).toFixed(2)}.`,
        makePdf: async () => {
          // No product code: the customer reads this, and our codes mean
          // nothing to them.
          const lines = (quote.items || []).map((item: any) => ({
            name: lineName(item),
            quantity: Number(item.quantity || 0),
            price: Number(item.price || 0),
            total: Number(item.total_price || 0),
          }));
          const pdf = await buildDocumentPdf({
            kind: "quotation",
            number,
            date: quote.created_at,
            customer: {
              name: quote.customer_name,
              phone: quote.phone,
              email: quote.email,
              address: quote.address,
              city: quote.city,
              state: quote.state,
              pincode: quote.pincode,
            },
            lines,
            subtotal: Number(quote.total_amount || 0),
            business,
          });
          return pdf.output("blob");
        },
      });
    };

    useEffect(() => {
      fetchQuotations();
    }, [fetchQuotations]);

    /**
     * Opens the quotation in the cart. Still offered from the edit popup:
     * the cart is where a quote is shared or converted with changes, and
     * someone used to that route should not lose it.
     */
    const handleOpenInCart = (quotation: any) => {
      loadQuotation(quotation);
      openCart();
    };

    /**
     * Turns the quotation into an order.
     *
     * The quotation is deleted once the order exists, the same as when one is
     * converted from inside the cart: the quote has become the order, and
     * leaving both would have the customer counted twice in every report.
     *
     * The prices are the quoted ones, not today's -- that is the whole point
     * of having quoted them.
     */
    const handleConvert = async (quote: any) => {
      const number = quote.short_id || String(quote.id).slice(0, 8);

      // Cleaned as the cart cleans an order (lib/deliveryDetails): this is
      // the one way to place an order without going through the cart, and a
      // quotation saved before the cart cleaned its details may still carry
      // stray spaces. Held to the quotation's rule, not the order's -- a
      // quotation has no district to give -- and checked before asking, so a
      // bad number is fixed in the quotation rather than found afterwards.
      const delivery = cleanDelivery({
        customerName: quote.customer_name || "",
        email: quote.email || "",
        phone: quote.phone || "",
        alternatePhone: "",
        referralPhone: "",
        address: quote.address || "",
        city: quote.city || "",
        district: "",
        state: quote.state || "",
        pincode: quote.pincode || "",
        country: "India",
      });
      const problem = deliveryProblem(delivery, "quotation");
      if (problem) {
        toast.error(`${problem} — edit quotation ${number} first.`);
        return;
      }

      const confirmed = window.confirm(
        `Convert quotation ${number} into an order?\n\n` +
          `${quote.customer_name || "Customer"} · ${(quote.items || []).length} products · ` +
          `Rs. ${Number(quote.total_amount || 0).toFixed(2)}\n\n` +
          `The order is created at the quoted prices and this quotation is removed.`
      );
      if (!confirmed) return;

      setConverting(quote.id);
      try {
        const order = await createOrder({
          total_amount: Number(quote.total_amount || 0),
          // The same as an order placed at the counter: nothing is paid yet.
          payment_method: "offline",
          season_id: quote.season_id ?? activeSeason?.id ?? null,
          items: (quote.items || []).map((item: any) => ({
            product_id: item.product_id ?? null,
            combo_pack_id: item.combo_pack_id ?? null,
            quantity: Number(item.quantity || 0),
            price: Number(item.price || 0),
            total_price: Number(item.total_price || 0),
          })),
          delivery_details: delivery,
        });

        // deleteQuotation asks for confirmation of its own, which would be a
        // second prompt for something already agreed to above.
        const { error } = await supabase.from("quotations").delete().eq("id", quote.id);
        if (error) {
          // The order is placed; a quotation left behind is untidy, not lost
          // work, so it is reported rather than rolled back.
          console.error("Quotation could not be removed after converting", error);
          toast.error(`Order ${order.short_id} created, but quotation ${number} is still listed`);
        } else {
          toast.success(`Order ${order.short_id} created from quotation ${number}`);
        }

        fetchQuotations();
        navigate("/orders");
      } catch (err) {
        console.error("Converting the quotation failed", err);
        toast.error(
          err instanceof Error ? `Could not convert: ${err.message}` : "Could not convert the quotation"
        );
      } finally {
        setConverting(null);
      }
    };


    /**
     * The bar above the list.
     *
     * Rendered in the loading and empty states too: scanning a sheet is how
     * the first quotation of the day gets made, and hiding the button behind
     * "you have no quotations yet" put it exactly where it was least useful.
     */
    const header = canScan ? (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Scan a customer's handwritten list instead of typing it out.
        </p>
        <button
          onClick={() => setScanning(true)}
          className="px-4 py-2 rounded-lg bg-primary-orange text-white font-medium text-sm hover:opacity-90 flex items-center gap-2"
        >
          <ScanIcon className="w-4 h-4" />
          Scan handwritten order
        </button>
      </div>
    ) : null;

    const scanModal =
      canScan && scanning ? (
        <Suspense fallback={null}>
          <ScanOrderSheetModal open onClose={() => setScanning(false)} />
        </Suspense>
      ) : null;

    if (loading) {
        return (
          <>
            {header}
            {scanModal}
            <div className="p-8 text-center">Loading quotations...</div>
          </>
        );
    }

    if (quotations.length === 0) {
      return (
        <>
        {header}
        {scanModal}
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Quotations Found</h3>
          <p className="text-gray-500">
            Create a quotation by selecting "Save Quotation" in the cart.
          </p>
        </div>
        </>
      );
    }

    return (
      <>
      {header}
      {scanModal}
      <WhatsAppShareDialog
        request={shareRequest}
        onClose={() => setShareRequest(null)}
      />
      {viewing && (
        <QuotationView quote={viewing} onClose={() => setViewing(null)} />
      )}
      {editing && (
        <EditQuotationModal
          quote={editing}
          fallbackSeasonId={activeSeason?.id ?? null}
          onClose={() => setEditing(null)}
          // The cart's own save, so the stored rows are the same either way.
          // It toasts and refreshes the list itself.
          onSave={async (details, lines) => {
            await saveQuotation(details, lines as any, editing.id);
          }}
          onOpenInCart={() => {
            const quote = editing;
            setEditing(null);
            handleOpenInCart(quote);
          }}
        />
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">Quote ID</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Customer</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Date</th>
                <th className="px-6 py-4 font-semibold text-gray-700 text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-gray-700 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-primary-orange">{quote.short_id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{quote.customer_name}</div>
                    <div className="text-sm text-gray-500">{quote.phone}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {format(new Date(quote.created_at), "MMM d, yyyy")}
                    <div className="text-xs text-gray-400">
                      {format(new Date(quote.created_at), "h:mm a")}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    ₹{Number(quote.total_amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setViewing(quote)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        title="View the quoted items"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditing(quote)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Edit this quotation"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleConvert(quote)}
                        disabled={converting === quote.id}
                        className="p-2 text-primary-orange hover:bg-orange-50 rounded-full transition-colors disabled:opacity-40"
                        title="Convert this quotation into an order"
                      >
                        {converting === quote.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <ShoppingCart className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleShare(quote)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors"
                        title="Send quotation on WhatsApp"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteQuotation(quote.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Delete Quotation"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
    );
  }

  /** The quoted lines, read only. Changing them is what Edit is for. */
  function QuotationView({ quote, onClose }: { quote: any; onClose: () => void }) {
    const items: any[] = quote.items || [];
    const totalQuantity = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Quotation {quote.short_id}
              </h2>
              <p className="text-sm text-gray-500">
                {quote.customer_name || "Customer"}
                {quote.phone ? ` · ${quote.phone}` : ""} ·{" "}
                {format(new Date(quote.created_at), "d MMM yyyy, h:mm a")}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-gray-500">
                This quotation has no items.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium w-10">#</th>
                    <th className="px-4 py-2 text-left font-medium">Product</th>
                    <th className="px-4 py-2 text-center font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Price</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, index) => (
                    <tr key={item.id ?? index}>
                      <td className="px-4 py-2 text-gray-400">{index + 1}</td>
                      <td className="px-4 py-2 text-gray-900">{lineName(item)}</td>
                      <td className="px-4 py-2 text-center">{item.quantity}</td>
                      <td className="px-4 py-2 text-right">
                        ₹{Number(item.price || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        ₹{Number(item.total_price || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium text-gray-700">
                  <tr>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">{items.length} products</td>
                    <td className="px-4 py-2 text-center">{totalQuantity}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right">
                      ₹{Number(quote.total_amount || 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }
