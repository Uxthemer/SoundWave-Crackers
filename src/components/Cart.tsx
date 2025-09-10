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
  const { user, userRole } = useAuth();
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

      // verify all the mandatory fields
      const {
        customerName,
        phone,
        address,
        city,
        state,
        district,
        pincode,
        email,
      } = deliveryDetails;
      if (
        !customerName ||
        !phone ||
        !address ||
        !city ||
        !state ||
        !district ||
        !pincode ||
        !email
      ) {
        throw new Error("Please fill all mandatory fields");
      }
      if (items.length === 0) {
        throw new Error("Your cart is empty");
      }

      // check phone number format (basic)
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        throw new Error("Please enter a valid 10-digit phone number");
      }
      if (deliveryDetails.alternatePhone) {
        if (!phoneRegex.test(deliveryDetails.alternatePhone)) {
          throw new Error(
            "Please enter a valid 10-digit alternate phone number"
          );
        }
      }
      if (deliveryDetails.referralPhone) {
        if (!phoneRegex.test(deliveryDetails.referralPhone)) {
          throw new Error(
            "Please enter a valid 10-digit referral phone number"
          );
        }
      }
      // check pincode format (basic)
      const pinRegex = /^[1-9][0-9]{5}$/;
      if (!pinRegex.test(pincode)) {
        throw new Error("Please enter a valid 6-digit pincode");
      }

      // Check if user is authenticated
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Please sign in to place an order");
      }

      // check minimum order amount >= 2000
      if (totalAmount < 2000) {
        throw new Error("Minimum order amount is ₹2000");
      }

      // check minumum order amount should be 2000 and above for tamilnadu state and 5000 and above for other states
      // if (state.toLowerCase() === "tamil nadu" && totalAmount < 2000) {
      //   throw new Error("Minimum order amount is ₹2000");
      // }
      // else if (state.toLowerCase() !== "tamilnadu" && totalAmount < 5000) {
      //   throw new Error("Minimum order amount is ₹5000 for your state");
      // }

      // --- PARALLEL STOCK CHECKS ---
      // Fire all stock queries in parallel
      // const stockResults = await Promise.all(
      //   items.map((item) =>
      //     supabase.from("products").select("stock").eq("id", item.id).single()
      //   )
      // );

      // Check for out-of-stock items
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

      setShowPayment(true);
      setShowDeliveryForm(false);
      setShowPhoneVerification(false);
      setVerificationId("");
      clearRecaptcha(); // <-- Clear recaptcha on error
      toast.success(
        "Order placed successfully! We will contact you shortly through phone or whatsapp for further details.",
        { duration: 10000 }
      );
      clearCart();
      setOrderSuccess(true);
      //onClose();
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

  const handleEstimateReport = () => {
    // Build HTML similar to order summary but for current cart  delivery details
    const now = new Date();
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Unable to open print window");
      return;
    }

    const itemsRows = items
      .map(
        (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.name}</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:right;">₹${item.offer_price.toFixed(2)}</td>
          <td style="text-align:right;">₹${item.totalPrice.toFixed(2)}</td>
        </tr>`
      )
      .join("");

    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Estimate Report</title>
        <style>
          body { font-family: Arial, sans-serif; color:#222; margin:20px; }
          h1 { color:#FF5722; }
          table { width:100%; border-collapse:collapse; margin-top:12px; }
          th, td { border:1px solid #e6e6e6; padding:8px; }
          th { background:#f7f7f7; text-align:left; }
          .right { text-align:right; }
          .center { text-align:center; }
          .summary { margin-top:16px; width:100%; }
          .small { font-size:0.9rem; color:#666; }
        </style>
      </head>
      <body>
      <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>  
      <h1>Estimation</h1>
        <div class="small">Date: ${now.toLocaleString()}</div>
        <h3>Customer Details</h3>
        <div class="small">
          <div><strong>Name:</strong> ${
            deliveryDetails.customerName || "-"
          }</div>
          <div><strong>Phone:</strong> ${deliveryDetails.phone || "-"}</div>
          <div><strong>Email:</strong> ${deliveryDetails.email || "-"}</div>
          <div><strong>Address:</strong> ${deliveryDetails.address || "-"}, ${
      deliveryDetails.city || ""
    } ${deliveryDetails.pincode || ""}</div>
        </div>
        </div>
        <div style=""><img style="height:100px" src="/assets/img/logo/logo_2.png" alt="logo"/></div>
     </div>
        <h3 style="margin-top:14px;">Product Details</h3>
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Product</th>
              <th class="center">Qty</th>
              <th class="right">Price</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
            <tr>
              <td colspan="4" class="right"><strong>Grand Total</strong></td>
              <td class="right"><strong>₹${totalAmount.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="summary small">
          <p>Note: This is an estimate. Final prices may vary.</p>
        </div>
      </body>
      </html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

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
        cleanup();
      }
    };

    if (printWindow.document.readyState === "complete") {
      doPrint();
    } else {
      printWindow.onload = doPrint;
      setTimeout(doPrint, 800);
    }

    // Safety close if afterprint doesn't fire
    setTimeout(cleanup, 20000);
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
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 w-full text-center shadow">
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
                    Go to Payment Option Page
                  </a>
                </div>
                <div className="text-sm text-gray-700">
                  <div className="font-semibold mb-1">Contact Us:</div>
                  <div className="flex flex-row space-x-3 justify-center align-items-center mb-1">
                    📞{"  "}
                    <a href="tel:+919789794518" className="underline">
                      +91 9789794518
                    </a>
                    <a href="tel:+919363515184" className="underline">
                      +91 9363515184
                    </a>
                  </div>
                  <div>
                    📱{" "}
                    <a
                      href="https://wa.me/919363515184"
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
                      href="mailto:soundwavecrackers@gmail.com"
                      className="underline"
                    >
                      soundwavecrackers@gmail.com
                    </a>
                  </div>
                </div>
                {
                  // referral message like share it with your friends and family
                  //and earn 5% ref commission on their first order, provide shareable link and make that sharable like available on whatsapp and facebook
                  <div className="text-sm text-gray-700 mt-4 text-primary-orange font-semibold">
                    Refer our website to your friends and family and earn{" "}
                    <p className="font-bold">5%</p> referral commission on their
                    first order! Share the link:{" "}
                    <a
                      href="https://www.soundwavecrackers.com"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      www.soundwavecrackers.com
                    </a>
                  </div>
                }
              </div>
              <div className="w-full">
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
                          <p className="font-mono">SoundWave Crackers</p>
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
                      //setShowPayment(true);
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
                        <div className="flex gap-3">
                          <button type="submit" className="btn-primary w-full">
                            Place Order
                          </button>
                          {["admin", "superadmin"].includes(
                            userRole?.name || ""
                          ) && (
                            <button
                              type="button"
                              onClick={handleEstimateReport}
                              className="px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                            >
                              Estimate Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </form>
                  {orderError && (
                    <div className="md:col-span-2 mt-2 text-center text-red-600">
                      {orderError}
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
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
