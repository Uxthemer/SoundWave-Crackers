import { useEffect, useState } from "react";
  import { useQuotations } from "../hooks/useQuotations";
  import { useCartStore } from "../store/cartStore";
  import { Eye, Trash2, ShoppingCart, MessageCircle } from "lucide-react";
  import { format } from "date-fns";
  import { useAppSettings } from "../context/AppSettingsContext";
  import { businessFromSettings } from "../lib/businessDetails";
  import { buildDocumentPdf, documentFileName } from "../lib/documentPdf";
  import {
    WhatsAppShareDialog,
    type WhatsAppShareRequest,
  } from "../components/WhatsAppShareDialog";
  
  // interface QuotationsListProps {
  //   onOpenCart: () => void;
  // }
  
  export function QuotationsList() {
    const { quotations, loading, fetchQuotations, deleteQuotation } = useQuotations();
    const { loadQuotation, openCart } = useCartStore();
    const { settings } = useAppSettings();

    const [shareRequest, setShareRequest] = useState<WhatsAppShareRequest | null>(null);

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
          const lines = (quote.items || []).map((item: any) => ({
            code: item.product?.product_code ?? item.pack?.pack_code ?? null,
            name: item.product?.name ?? item.pack?.name ?? "Item",
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
  
    const handleEdit = (quotation: any) => {
      loadQuotation(quotation);
      openCart();
    };
  
    if (loading) {
        return <div className="p-8 text-center">Loading quotations...</div>;
    }
  
    if (quotations.length === 0) {
      return (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Quotations Found</h3>
          <p className="text-gray-500">
            Create a quotation by selecting "Save Quotation" in the cart.
          </p>
        </div>
      );
    }
  
    return (
      <>
      <WhatsAppShareDialog
        request={shareRequest}
        onClose={() => setShareRequest(null)}
      />
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
                        onClick={() => handleEdit(quote)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="View / Edit / Convert to Order"
                      >
                        <Eye className="w-5 h-5" />
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
  
