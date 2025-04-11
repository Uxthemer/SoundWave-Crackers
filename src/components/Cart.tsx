import { motion } from "framer-motion";
import { X, QrCode, Wallet, CreditCard, Loader2, Trash2  } from "lucide-react";
import { useCartStore } from "../store/cartStore";
import { useEffect, useState } from "react";
import { createOrder } from "../hooks/useOrders";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DeliveryDetails {
  customerName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  referralPhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export function Cart({ isOpen, onClose }: CartProps) {
  const { items, totalAmount, totalActualAmount, removeFromCart, updateQuantity, clearCart } =
    useCartStore();
  const [showPayment, setShowPayment] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { userProfile } = useAuth();
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>({
    customerName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    referralPhone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });

  useEffect(() => {
    setDeliveryDetails((prev) => ({
      ...prev,
      customerName: userProfile?.full_name || "",
      email: userProfile?.email || "",
      phone: userProfile?.phone || "",
      address: userProfile?.address || "",
      city: userProfile?.city || "",
      state: userProfile?.state || "",
      pincode: userProfile?.pincode || "",
    }));
  }, [userProfile]);

  const handleDeliveryDetailsChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setDeliveryDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePlaceOrder = async (paymentMethod: string) => {
    try {
      setIsProcessing(true);

      // Check if user is authenticated
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Please sign in to place an order");
      }

      // Create order
      const orderItems = items.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        price: item.offer_price,
        total_price: item.totalPrice,
      }));

      await createOrder({
        total_amount: totalAmount,
        payment_method: paymentMethod,
        items: orderItems,
        delivery_details: deliveryDetails,
      });

      // Clear cart and reset states
      clearCart();
      setShowPayment(false);
      setShowDeliveryForm(false);
      onClose();

      // Show success message
      toast.success(
        "Order placed successfully! We will contact you shortly through phone or whatsapp for further details."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to place order"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50"
    >
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-background overflow-y-auto">
        <div className="sticky top-0 bg-background z-10 p-6 border-b border-card-border/10">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-2xl">Shopping Cart</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-card/50 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {items.length === 0 ? (
            <p className="text-center text-text/60">Your cart is empty</p>
          ) : (
            <>
              <div className="bg-card/30 rounded-xl overflow-hidden shadow-lg mb-8">
                <table className="w-full">
                  <thead>
                    <tr className="bg-card/50">
                      <th className="py-4 px-6 text-left">Product</th>
                      <th className="py-4 px-6 text-center">Quantity</th>
                      <th className="py-4 px-6 text-right">Price</th>
                      <th className="py-4 px-6 text-right">Total</th>
                      <th className="py-4 px-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-card-border/10"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-4">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                            <div>
                              <h3 className="font-montserrat font-bold">
                                {item.name}
                              </h3>
                              <p className="text-sm text-text/60">
                                {item.content}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center">
                            <input
                              type="number"
                              min="0"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(
                                  item.id,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-20 px-3 py-2 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                            />
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          ₹{item.offer_price}
                        </td>
                        <td className="py-4 px-6 text-right font-bold">
                          ₹{item.totalPrice.toFixed(2)}
                        </td>
                        <td className="py-4 px-2 pr-4 text-right">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-primary-red hover:text-primary-red/80 transition-colors"
                          >
                            <Trash2/> 
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mb-8">
                <div className="bg-card/30 rounded-xl p-6 w-80">
                  <h3 className="font-montserrat font-bold text-xl mb-4">
                    Order Summary
                  </h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className="text-text/60">Actual Price</span>
                      <span><s>₹{totalActualAmount.toFixed(2)} </s></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text/60">You Saved (Discount)</span>
                      <span>{(totalActualAmount - totalAmount).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="border-t border-card-border/10 pt-4">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary-orange">
                        ₹{totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {!showDeliveryForm && !showPayment && (
                <button
                  onClick={() => setShowDeliveryForm(true)}
                  className="btn-primary w-full mb-8"
                >
                  Proceed to Checkout
                </button>
              )}

              {showDeliveryForm && (
                <div className="bg-card/30 rounded-xl p-6 mb-8">
                  <h3 className="font-montserrat font-bold text-xl mb-6">
                    Delivery Details
                  </h3>
                  <form
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handlePlaceOrder("offline");
                      setShowPayment(true);
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Name *
                      </label>
                      <input
                        type="text"
                        name="customerName"
                        value={deliveryDetails.customerName}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Email
                      </label>
                      <input
                        disabled
                        type="email"
                        name="email"
                        defaultValue={deliveryDetails.email}
                        // value={deliveryDetails.email}
                        onChange={handleDeliveryDetailsChange}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Phone *
                      </label>
                      <input
                        disabled
                        readOnly
                        type="tel"
                        name="phone"
                        value={deliveryDetails.phone}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Address *
                      </label>
                      <input
                        type="text"
                        name="address"
                        value={deliveryDetails.address}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Alternate Phone No.
                      </label>
                      <input
                        type="tel"
                        name="alternatePhone"
                        value={deliveryDetails.alternatePhone}
                        onChange={handleDeliveryDetailsChange}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        City *
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={deliveryDetails.city}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        State *
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={deliveryDetails.state}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Pincode *
                      </label>
                      <input
                        type="text"
                        name="pincode"
                        value={deliveryDetails.pincode}
                        onChange={handleDeliveryDetailsChange}
                        required
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Country
                      </label>
                      <input
                        readOnly
                        type="text"
                        name="country"
                        value={deliveryDetails.country}
                        disabled
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Referred By – Contact Number
                      </label>
                      <input
                        type="tel"
                        name="referralPhone"
                        defaultValue=""
                        onChange={handleDeliveryDetailsChange}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-card-border focus:outline-none focus:border-primary-orange"
                      />
                    </div>
                    <div className="md:col-span-2">
                      {isProcessing ? (
                        <button
                          type="submit"
                          disabled
                          className="btn-primary w-full"
                        >
                          {/* <Loader2 className="w-5 mr-2 animate-spin" /> */}
                          Processing Order...
                        </button>
                      ) : (
                        <button type="submit" className="btn-primary w-full">
                          Place Order
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              {showPayment && (
                <div className="bg-card/30 rounded-xl p-6">
                  <h3 className="font-montserrat font-bold text-xl mb-6">
                    Payment Options
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button
                      onClick={() => handlePlaceOrder("qr")}
                      disabled={isProcessing}
                      className="bg-card p-6 rounded-xl hover:bg-card/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <QrCode className="w-6 h-6 text-primary-orange" />
                        <h4 className="font-montserrat font-bold">
                          Scan QR Code
                        </h4>
                      </div>
                      <div className="bg-white p-4 rounded-lg mb-4">
                        <img
                          src="https://images.unsplash.com/photo-1614332287897-cdc485fa562d?w=800&auto=format&fit=crop"
                          alt="QR Code"
                          className="w-full aspect-square object-cover rounded"
                        />
                      </div>
                      <p className="text-sm text-text/60 text-center">
                        Scan to pay instantly
                      </p>
                    </button>

                    <button
                      onClick={() => handlePlaceOrder("upi")}
                      disabled={isProcessing}
                      className="bg-card p-6 rounded-xl hover:bg-card/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <Wallet className="w-6 h-6 text-primary-orange" />
                        <h4 className="font-montserrat font-bold">
                          UPI Payment
                        </h4>
                      </div>
                      <p className="text-sm text-text/60 mb-4">
                        Pay using any UPI app
                      </p>
                      <div className="bg-background p-4 rounded-lg">
                        <p className="font-mono text-center select-all">
                          soundwavecrackers@upi
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={() => handlePlaceOrder("bank")}
                      disabled={isProcessing}
                      className="bg-card p-6 rounded-xl hover:bg-card/70 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="w-6 h-6 text-primary-orange" />
                        <h4 className="font-montserrat font-bold">
                          Bank Transfer
                        </h4>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-text/60">Account Name</p>
                          <p className="font-mono">
                            SoundWave Crackers Pvt Ltd
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-text/60">Account Number</p>
                          <p className="font-mono">1234 5678 9012 3456</p>
                        </div>
                        <div>
                          <p className="text-sm text-text/60">IFSC Code</p>
                          <p className="font-mono">ABCD0123456</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {isProcessing && (
                    <div className="mt-6 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
                      <span className="ml-2">Processing your order...</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
