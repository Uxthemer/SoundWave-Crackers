import { useEffect } from "react";
  import { useQuotations } from "../hooks/useQuotations";
  import { useCartStore } from "../store/cartStore";
  import { Eye, Trash2, ShoppingCart } from "lucide-react";
  import { format } from "date-fns";
  
  // interface QuotationsListProps {
  //   onOpenCart: () => void;
  // }
  
  export function QuotationsList() {
    const { quotations, loading, fetchQuotations, deleteQuotation } = useQuotations();
    const { loadQuotation, openCart } = useCartStore();
  
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
    );
  }
  
