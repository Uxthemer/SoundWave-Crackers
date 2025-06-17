import { useState } from "react";
import { fetchOrders, supabase } from "../lib/supabase";
import { Loader2 } from "lucide-react";

export function TrackOrder() {
  const [input, setInput] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOrders([]);
    // Check login
    const session = await supabase.auth.getSession();
    const currentUser = session.data?.session?.user;
    if (!currentUser) {
      setError("You must be logged in to track your order.");
      return;
    }
    if (!input.trim()) {
      setError("Please enter an Order ID or Phone Number.");
      return;
    }
    setLoading(true);

    const data = await fetchOrders(input);
    if (!data || data.length === 0) {
      setError("No orders found for the given input.");
    } else {
      setOrders(data);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-background">
      <div className="container mx-auto px-4 max-w-lg">
        <h1 className="text-3xl font-bold mb-2 text-center">Track Your Order</h1>
        <div className="mb-6 text-center text-text/70">
          You must be logged in to track your order.
        </div>
        <form onSubmit={handleSearch} className="flex flex-col gap-4 mb-8">
          <input
            type="text"
            placeholder="Enter Order ID or Phone Number"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="px-4 py-3 rounded-lg border border-card-border/20 focus:outline-none focus:border-primary-orange"
          />
          <button
            type="submit"
            className="btn-primary flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Track Order
          </button>
        </form>
        {error && (
          <div className="mb-6 text-red-600 text-center">{error}</div>
        )}
        {orders.length > 0 && (
          <div className="space-y-6">
            {orders.map(order => (
              <div
                key={order.id}
                className="bg-card rounded-xl p-6 shadow flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">Order ID:</span>
                  <span className="font-mono">{order.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">Phone:</span>
                  <span>{order.phone}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">Status:</span>
                  <span className="text-primary-orange font-semibold">{order.status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">Placed On:</span>
                  <span>{new Date(order.created_at).toLocaleString()}</span>
                </div>
                {/* Add more order details as needed */}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}