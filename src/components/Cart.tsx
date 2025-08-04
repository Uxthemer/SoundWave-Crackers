import { motion } from "framer-motion";
import { X, QrCode, Wallet, CreditCard, Loader2, Trash2 } from "lucide-react";
import { useCartStore } from "../store/cartStore";
import { useEffect, useState, useRef } from "react";
import { createOrder } from "../hooks/useOrders";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import Select from "react-select";

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
  district: string; // <-- add this
  pincode: string;
  country: string;
}

export function Cart({ isOpen, onClose }: CartProps) {
  const {
    items,
    totalAmount,
    totalActualAmount,
    removeFromCart,
    updateQuantity,
    clearCart,
  } = useCartStore();
  const [showPayment, setShowPayment] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { userProfile, signInWithPhone, verifyOTP } = useAuth();
  const cartAddressRef = useRef<HTMLDivElement>(null);
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>({
    customerName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    referralPhone: "",
    address: "",
    city: "",
    state: "",
    district: "", // <-- add this
    pincode: "",
    country: "India",
  });
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statesList, setStatesList] = useState<{ id: number; name: string }[]>(
    []
  );
  const [districtsList, setDistrictsList] = useState<
    { id: number; name: string }[]
  >([]);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false); // <-- New state

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

  // Add this utility function to clear recaptcha (if you use a ref, adjust accordingly)
  function clearRecaptcha() {
    const recaptcha = document.getElementById("recaptcha-container");
    if (recaptcha) recaptcha.innerHTML = "";
  }

  useEffect(() => {
    if (showPhoneVerification && verifyingPhone) {
      (async () => {
        const { verificationId: vId, error } = await signInWithPhone(
          verifyingPhone
        );
        if (!error && vId) {
          setVerificationId(vId);
        } else {
          setShowPhoneVerification(false);
          setVerificationId("");
          clearRecaptcha(); // <-- Clear recaptcha on error
          toast.success(
            "Order placed successfully! We will contact you shortly through phone or whatsapp for further details.",
            { duration: 10000 }
          );
          clearCart();
          onClose();
          fireworkConfetti();
        }
      })();
    }
  }, [showPhoneVerification, verifyingPhone]);

  const handleDeliveryDetailsChange = (e: {
    target: { name: string; value: string };
  }) => {
    const { name, value } = e.target;
    setDeliveryDetails((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "state" ? { district: "" } : {}),
    }));
  };

  const handlePlaceOrder = async (paymentMethod: string) => {
    try {
      setIsProcessing(true);
      setOrderError(null);

      // Check if user is authenticated
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Please sign in to place an order");
      }

      // --- PARALLEL STOCK CHECKS ---
      // Fire all stock queries in parallel
      // const stockResults = await Promise.all(
      //   items.map((item) =>
      //     supabase.from("products").select("stock").eq("id", item.id).single()
      //   )
      // );

      // // Check for out-of-stock items
      // for (let i = 0; i < items.length; i++) {
      //   const stock = stockResults[i].data?.stock ?? 0;
      //   if (items[i].quantity > stock) {
      //     throw new Error(
      //       `Insufficient stock for ${items[i].name}. Only ${stock} left.`
      //     );
      //   }
      // }

      // Create order
      const orderItems = items.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        price: item.offer_price,
        total_price: item.totalPrice,
      }));

      // Create order and get the order data (with id)
      const orderData = await createOrder({
        total_amount: totalAmount,
        payment_method: paymentMethod,
        items: orderItems,
        delivery_details: deliveryDetails,
      });

      setLastOrderId(orderData.id);

      // setVerifyingPhone(deliveryDetails.phone);
      // setShowPhoneVerification(true);

      setShowPayment(false);
      setShowDeliveryForm(false);
      setShowPhoneVerification(false);
      setVerificationId("");
      clearRecaptcha(); // <-- Clear recaptcha on error
      toast.success(
        "Order placed successfully! We will contact you shortly through phone or whatsapp for further details.",
        { duration: 10000 }
      );
      clearCart();
      onClose();
      fireworkConfetti();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to place order";
      setOrderError(msg); // Set error for display below form
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Utility function for fireworks effect
  function fireworkConfetti() {
    const duration = 10 * 1000; // 3 seconds (adjust as needed)
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 9999,
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);
      // since particles fall down, start a bit higher than random
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  }

  // Fetch active states on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("states")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (!error && data) setStatesList(data);
    })();
  }, []);

  // Fetch districts when state changes
  useEffect(() => {
    if (!deliveryDetails.state) {
      setDistrictsList([]);
      return;
    }
    (async () => {
      // Find state id by name
      const selectedState = statesList.find(
        (s) => s.name === deliveryDetails.state
      );
      if (!selectedState) return;
      const { data, error } = await supabase
        .from("districts")
        .select("id, name")
        .eq("state_id", selectedState.id)
        .eq("is_active", true)
        .order("name");
      if (!error && data) setDistrictsList(data);
    })();
  }, [deliveryDetails.state, statesList]);

  if (!isOpen) return null;

  // Convert states and districts to select options
  const stateOptions = statesList.map((state) => ({
    value: state.name,
    label: state.name,
  }));
  const districtOptions = districtsList.map((district) => ({
    value: district.name,
    label: district.name,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-60 flex justify-end"
    >
      {isProcessing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60">
          <Loader2 className="w-12 h-12 animate-spin text-primary-orange mb-4" />
          <span className="text-lg font-semibold text-white">
            Processing your order...
          </span>
        </div>
      )}
      <div className="h-full w-full max-w-4xl bg-background overflow-y-auto flex flex-col relative">
        {/* Header */}
        <div className="sticky top-0 bg-background z-10 p-4 md:p-6 border-b border-card-border/10">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl md:text-2xl">Shopping Cart</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-card/50 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 flex-grow">
          {orderSuccess ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-lg w-full text-center shadow">
                <h2 className="text-2xl font-bold text-green-700 mb-2">
                  🎉 Enquiry Submitted Successfully!
                </h2>
                <p className="text-base text-green-800 mb-4">
                  Thank you for your order. Our team will contact you soon
                  regarding order and payment confirmation.
                  <br />
                  <br />
                  Meanwhile, you can use any of our payment options below to
                  complete your payment and send us the screenshot with your
                  contact details, or you can contact us directly.
                </p>
                <div className="mb-4">
                  <a
                    href="/payment"
                    className="inline-block px-6 py-2 bg-primary-orange text-white rounded-lg font-semibold hover:bg-primary-orange/90 transition"
                  >
                    Go to Payment Page
                  </a>
                </div>
                <div className="text-sm text-gray-700">
                  <div className="font-semibold mb-1">Contact Us:</div>
                  <div>
                    📞{" "}
                    <a href="tel:+919876543210" className="underline">
                      +91 98765 43210
                    </a>
                  </div>
                  <div>
                    📱{" "}
                    <a
                      href="https://wa.me/919876543210"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                  <div>
                    ✉️{" "}
                    <a
                      href="mailto:support@soundwavecrackers.com"
                      className="underline"
                    >
                      support@soundwavecrackers.com
                    </a>
                  </div>
                </div>
              </div>
              <div className="w-full max-w-lg">
                <div className="bg-card/30 rounded-xl p-4 md:p-6 w-full">
                  <h3 className="font-montserrat font-bold text-lg md:text-xl mb-4">
                    Payment Options
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-card p-6 rounded-xl">
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
                    </div>
                    <div className="bg-card p-6 rounded-xl">
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
                    </div>
                    <div className="bg-card p-6 rounded-xl">
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
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-text/60">Your cart is empty</p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Cart Table */}
              <div className="bg-card/30 rounded-xl overflow-x-auto shadow-lg">
                {/* Desktop/Table View */}
                <table className="min-w-full text-sm hidden sm:table">
                  <thead>
                    <tr className="bg-card/50">
                      <th className="py-4 px-2 sm:px-4 text-left whitespace-nowrap">
                        Product
                      </th>
                      <th className="py-4 px-2 sm:px-4 text-center whitespace-nowrap">
                        Quantity
                      </th>
                      <th className="py-4 px-2 sm:px-4 text-right whitespace-nowrap">
                        Price
                      </th>
                      <th className="py-4 px-2 sm:px-4 text-right whitespace-nowrap">
                        Total
                      </th>
                      <th className="py-4 px-2 sm:px-4 whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-card-border/10"
                      >
                        <td className="py-4 px-2 sm:px-4 max-w-xs">
                          <div className="flex items-center gap-2 sm:gap-4 max-w-full">
                            <img
                              src={
                                item.image
                                  ? Array.isArray(item.image)
                                    ? item.image[0]
                                    : item.image?.split(",")[0]
                                  : `/assets/img/crackers/${
                                      item.image_url?.split(",")[0]
                                    }` || "/assets/img/logo/logo-product.png"
                              }
                              alt={item.name}
                              className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg"
                            />
                            <div className="min-w-0">
                              <h3 className="font-montserrat font-bold truncate">
                                {item.name}
                              </h3>
                              <p className="text-xs sm:text-sm text-text/60 truncate">
                                {item.content}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 sm:px-4">
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
                              className="w-16 sm:w-20 px-2 sm:px-3 py-2 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                            />
                          </div>
                        </td>
                        <td className="py-4 px-2 sm:px-4 text-right">
                          ₹{item.offer_price}
                        </td>
                        <td className="py-4 px-2 sm:px-4 text-right font-bold">
                          ₹{item.totalPrice.toFixed(2)}
                        </td>
                        <td className="py-4 px-2 sm:px-4 text-right">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-primary-red hover:text-primary-red/80 transition-colors"
                          >
                            <Trash2 />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile Card View */}
                <div className="sm:hidden flex flex-col gap-3 p-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-lg shadow flex px-3 py-2 relative"
                    >
                      <img
                        src={
                          item.image
                            ? Array.isArray(item.image)
                              ? item.image[0]
                              : item.image?.split(",")[0]
                            : `/assets/img/crackers/${
                                item.image_url?.split(",")[0]
                              }` || "/assets/img/logo/logo-product.png"
                        }
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                      <div className="flex-1 min-w-0 pl-2 flex flex-col justify-between">
                        {/* Product name and trash button */}
                        <div className="flex items-start justify-between w-40">
                          <div className="font-bold truncate">{item.name}</div>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="absolute top-2 right-1 text-primary-red hover:text-primary-red/80 transition-colors p-1"
                            title="Remove"
                            style={{ fontSize: "1rem", lineHeight: 1 }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs text-text/60 truncate">
                          {item.content}
                        </div>
                        {/* Quantity and price row */}
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text/60">Qty:</span>
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
                              className="w-12 px-2 py-1 text-center rounded-lg border border-card-border/10 focus:outline-none focus:border-primary-orange text-sm"
                            />
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-text/60">
                              ₹{item.offer_price}
                            </span>
                            <span className="font-bold text-base text-right">
                              ₹{item.totalPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="w-full flex flex-col items-end">
                <div className="bg-card/30 rounded-xl p-4 md:p-6 w-full max-w-sm">
                  <h3 className="font-montserrat font-bold text-lg md:text-xl mb-4">
                    Order Summary
                  </h3>
                  <div className="space-y-2 mb-4 text-sm md:text-base">
                    <div className="flex justify-between">
                      <span className="text-text/60">Actual Price</span>
                      <span>
                        <s>₹{totalActualAmount.toFixed(2)}</s>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text/60">You Saved (Discount)</span>
                      <span>
                        ₹{(totalActualAmount - totalAmount).toFixed(2)}
                      </span>
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

              {/* Step Buttons */}
              {!showDeliveryForm && !showPayment && (
                <button
                  onClick={() => {
                    if (!user) {
                      toast.error("Please sign in to proceed with checkout");
                      navigate("/login");
                      return;
                    }
                    setShowDeliveryForm(true);
                    setTimeout(() => {
                      cartAddressRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 100);
                  }}
                  className="btn-primary w-full"
                >
                  Proceed to Checkout
                </button>
              )}

              {/* Delivery Form */}
              {showDeliveryForm && (
                <div
                  className="bg-card/30 rounded-xl p-6 mb-8"
                  ref={cartAddressRef}
                >
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
                        State *
                      </label>
                      <Select
                        options={stateOptions}
                        value={
                          stateOptions.find(
                            (opt) => opt.value === deliveryDetails.state
                          ) || null
                        }
                        onChange={(option) =>
                          handleDeliveryDetailsChange({
                            target: {
                              name: "state",
                              value: option?.value || "",
                            },
                          } as any)
                        }
                        isClearable
                        placeholder="Select State"
                        classNamePrefix="react-select"
                        isDisabled={isProcessing}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        District *
                      </label>
                      <Select
                        options={districtOptions}
                        value={
                          districtOptions.find(
                            (opt) => opt.value === deliveryDetails.district
                          ) || null
                        }
                        onChange={(option) =>
                          handleDeliveryDetailsChange({
                            target: {
                              name: "district",
                              value: option?.value || "",
                            },
                          } as any)
                        }
                        isClearable
                        placeholder="Select District"
                        isDisabled={!deliveryDetails.state || isProcessing}
                        classNamePrefix="react-select"
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
                  {orderError && (
                    <div className="md:col-span-2 mt-2 text-center text-red-600 font-semibold">
                      {orderError}
                    </div>
                  )}
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

              {showPhoneVerification && verificationId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm relative">
                    <button
                      className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                      onClick={() => setShowPhoneVerification(false)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                    <h2 className="text-xl font-bold mb-4 text-center">
                      Verify Phone Number
                    </h2>
                    <div className="mb-4 text-center">
                      <span className="text-sm text-text/70">
                        Enter the OTP sent to
                      </span>
                      <div className="font-semibold">{verifyingPhone}</div>
                      <button
                        className="text-xs text-primary-orange underline mt-1"
                        onClick={() => setVerifyingPhone("")}
                      >
                        Change phone number
                      </button>
                    </div>
                    {verifyingPhone === "" ? (
                      <input
                        type="tel"
                        placeholder="Enter new phone number"
                        className="w-full px-3 py-2 border rounded mb-4"
                        value={verifyingPhone}
                        onChange={(e) => setVerifyingPhone(e.target.value)}
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Enter OTP"
                          className="w-full px-3 py-2 border rounded mb-4"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          maxLength={6}
                        />
                        {otpError && (
                          <div className="text-red-500 text-xs mb-2">
                            {otpError}
                          </div>
                        )}
                        <button
                          className="btn-primary w-full mb-2"
                          disabled={isVerifying}
                          onClick={async () => {
                            setIsVerifying(true);
                            setOtpError("");
                            try {
                              const { error } = await verifyOTP(
                                verificationId,
                                otp
                              );
                              if (error) throw error;
                              if (lastOrderId) {
                                await supabase
                                  .from("orders")
                                  .update({ ph_verified: true })
                                  .eq("id", lastOrderId);
                              }
                              setShowPhoneVerification(false);
                              clearRecaptcha();
                              fireworkConfetti();
                              toast.success(
                                "Phone number verified successfully!"
                              );
                              setOrderSuccess(true); // <-- Show success message in cart
                              clearCart();
                              // Do NOT call onClose();
                            } catch (err: any) {
                              setOtpError(err.message || "Invalid OTP");
                              clearRecaptcha();
                            } finally {
                              setIsVerifying(false);
                            }
                          }}
                        >
                          {isVerifying ? "Verifying..." : "Verify"}
                        </button>
                        <button
                          className="text-xs text-primary-orange underline"
                          onClick={async () => {
                            // Resend OTP logic
                            const { verificationId: vId, error } =
                              await signInWithPhone(verifyingPhone);
                            if (error) {
                              setOtpError("Failed to resend OTP");
                            } else {
                              setVerificationId(vId ?? "");
                              toast.success("OTP resent!");
                            }
                          }}
                        >
                          Resend OTP
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {orderSuccess && (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-6">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-lg w-full text-center shadow">
                    <h2 className="text-2xl font-bold text-green-700 mb-2">
                      🎉 Enquiry Submitted Successfully!
                    </h2>
                    <p className="text-base text-green-800 mb-4">
                      Thank you for your order. Our team will contact you soon
                      regarding order and payment confirmation.
                      <br />
                      <br />
                      Meanwhile, you can use any of our payment options below to
                      complete your payment and send us the screenshot with your
                      contact details, or you can contact us directly.
                    </p>
                    <div className="mb-4">
                      <a
                        href="/payment"
                        className="inline-block px-6 py-2 bg-primary-orange text-white rounded-lg font-semibold hover:bg-primary-orange/90 transition"
                      >
                        Go to Payment Page
                      </a>
                    </div>
                    <div className="text-sm text-gray-700">
                      <div className="font-semibold mb-1">Contact Us:</div>
                      <div>
                        📞{" "}
                        <a href="tel:+919876543210" className="underline">
                          +91 98765 43210
                        </a>
                      </div>
                      <div>
                        📱{" "}
                        <a
                          href="https://wa.me/919876543210"
                          className="underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                      </div>
                      <div>
                        ✉️{" "}
                        <a
                          href="mailto:support@soundwavecrackers.com"
                          className="underline"
                        >
                          support@soundwavecrackers.com
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="w-full max-w-lg">
                    {/* Optionally, show payment options here as well */}
                    <div className="bg-card/30 rounded-xl p-4 md:p-6 w-full">
                      <h3 className="font-montserrat font-bold text-lg md:text-xl mb-4">
                        Payment Options
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-card p-6 rounded-xl">
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
                        </div>
                        <div className="bg-card p-6 rounded-xl">
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
                        </div>
                        <div className="bg-card p-6 rounded-xl">
                          <div className="flex items-center gap-3 mb-4">
                            <CreditCard className="w-6 h-6 text-primary-orange" />
                            <h4 className="font-montserrat font-bold">
                              Bank Transfer
                            </h4>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-text/60">
                                Account Name
                              </p>
                              <p className="font-mono">
                                SoundWave Crackers Pvt Ltd
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-text/60">
                                Account Number
                              </p>
                              <p className="font-mono">1234 5678 9012 3456</p>
                            </div>
                            <div>
                              <p className="text-sm text-text/60">IFSC Code</p>
                              <p className="font-mono">ABCD0123456</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
