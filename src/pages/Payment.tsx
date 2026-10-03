import { useState } from "react";
import { motion } from "framer-motion";
import { QrCode, Wallet, Copy, Check } from "lucide-react";
import toast from "react-hot-toast";
import { UPI_ID } from "../lib/paymentDetails";

/**
 * Where the order confirmation sends customers to pay.
 *
 * Two ways to pay, both large. Bank transfer used to sit alongside them and
 * pulled attention away from the two that complete in seconds — and the
 * confirmation screen no longer offers it either, so the two stay in step.
 */
export function Payment() {
  const [copied, setCopied] = useState(false);

  /**
   * clipboard.writeText needs a secure context and permission, neither of
   * which is guaranteed on a customer's phone, so a failure says so rather
   * than silently doing nothing.
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      toast.success("UPI ID copied");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy — please select the UPI ID and copy it");
    }
  };

  return (
    <div className="pt-2 min-h-screen">
      <div className="container mx-auto px-6 py-8 mt-5 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl mb-2">Pay Now</h1>
          <p className="text-text/70">
            Scan the code or pay to our UPI ID, then send us the screenshot
            along with your order number.
          </p>
        </div>

        {/* Laid out as on the order confirmation in Cart.tsx: the QR gets
            the wider column, since it is the one people scan. */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-card p-4 md:p-6 rounded-xl flex flex-col items-center"
          >
            <div className="flex items-center gap-3 mb-4">
              <QrCode className="w-7 h-7 text-primary-orange" />
              <h2 className="font-montserrat font-bold text-xl">
                Scan &amp; Pay
              </h2>
            </div>
            {/* The image is a portrait payment card, not a bare square code.
                Forced into a square it shrank to about 70% of the box; at its
                own shape it fills the width. */}
            <div className="bg-white p-2 rounded-lg w-full max-w-sm">
              <img
                src="/assets/img/payment/QR-Code-payment.jpg"
                alt="UPI QR code for Soundwave Crackers"
                width={665}
                height={942}
                className="w-full h-auto rounded"
              />
            </div>
            <p className="text-sm text-text/60 text-center mt-4">
              Works with GPay, PhonePe, Paytm and any UPI app
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-card p-4 md:p-6 rounded-xl flex flex-col items-center justify-center"
          >
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="w-7 h-7 text-primary-orange" />
              <h2 className="font-montserrat font-bold text-xl">UPI ID</h2>
            </div>
            {/* Sized to sit on one line in this column. If it ever must wrap,
                it breaks before the @ (the <wbr>) rather than mid-handle,
                which is what break-all did: "…@oksb" / "i". */}
            <div className="bg-background w-full rounded-lg px-3 py-4 text-center">
              <p className="font-mono text-base sm:text-lg lg:text-base font-bold break-words select-all">
                {UPI_ID.split("@")[0]}
                <wbr />
                {UPI_ID.includes("@") && `@${UPI_ID.split("@").slice(1).join("@")}`}
              </p>
            </div>
            {/* Reading a UPI id off a screen and typing it into another app is
                where payments go wrong. */}
            <button
              type="button"
              onClick={handleCopy}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-orange text-white font-semibold hover:bg-primary-orange/90 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>Copy UPI ID</span>
                </>
              )}
            </button>
            <p className="text-sm text-text/60 text-center mt-4">
              Paste this in your UPI app to pay
            </p>
          </motion.div>
        </div>

        <p className="text-center text-sm text-text/70 mt-8">
          Paid already? Send the screenshot on{" "}
          <a
            href="https://wa.me/919363515184"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-orange font-semibold underline"
          >
            WhatsApp
          </a>{" "}
          and we will confirm your order.
        </p>
      </div>
    </div>
  );
}
