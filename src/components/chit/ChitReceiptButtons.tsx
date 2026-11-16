import { useState } from "react";
import { Download, Loader2, MessageCircle } from "lucide-react";
import toast from "react-hot-toast";
import type { BusinessDetails } from "../../lib/businessDetails";
import { rupees, type ChitEnrollment, type ChitPayment } from "../../lib/chit";
import { receiptFacts, receiptFileName, receiptNumber } from "../../lib/chitReceipt";
import type { SendPdfRequest } from "../SendPdfOnWhatsAppDialog";

/**
 * Receipts for approved chit payments: download for the member, download and
 * send on WhatsApp for the superadmin. The PDF code is loaded only when a
 * receipt is actually made.
 */

async function makeReceiptPdf(
  enrollment: ChitEnrollment,
  payments: ChitPayment[],
  payment: ChitPayment,
  business: BusinessDetails
) {
  const { buildChitReceiptPdf } = await import("../../lib/chitReceiptPdf");
  return buildChitReceiptPdf(receiptFacts(enrollment, payments, payment), business);
}

export async function downloadChitReceipt(
  enrollment: ChitEnrollment,
  payments: ChitPayment[],
  payment: ChitPayment,
  business: BusinessDetails
) {
  const pdf = await makeReceiptPdf(enrollment, payments, payment, business);
  pdf.save(receiptFileName(payment));
}

/**
 * What the WhatsApp dialog sends: the receipt PDF, to the member's number or
 * any other, with a short message naming the amount and the receipt number.
 */
export function chitReceiptShareRequest(
  enrollment: ChitEnrollment,
  payments: ChitPayment[],
  payment: ChitPayment,
  business: BusinessDetails
): SendPdfRequest {
  const facts = receiptFacts(enrollment, payments, payment);
  return {
    title: `Receipt ${receiptNumber(payment)}`,
    customerName: enrollment.member_name,
    phone: enrollment.phone,
    documents: [
      {
        key: "receipt",
        label: "Payment receipt",
        fileName: receiptFileName(payment),
        message:
          `Hello ${enrollment.member_name}, we have received your chit payment of ${rupees(facts.amount)} ` +
          `for ${facts.monthsCovered} (${enrollment.plan_name}). Paid so far ${rupees(facts.paidSoFar)} of ` +
          `${rupees(facts.target)}. Thank you! Your receipt ${facts.number} is attached. — ${business.name}`,
        makePdf: async () => (await makeReceiptPdf(enrollment, payments, payment, business)).output("blob"),
      },
    ],
  };
}

export function ChitReceiptButtons({
  enrollment,
  payments,
  payment,
  business,
  onShare,
}: {
  enrollment: ChitEnrollment;
  payments: ChitPayment[];
  payment: ChitPayment;
  business: BusinessDetails;
  /** The superadmin's WhatsApp button; members only download. */
  onShare?: (request: SendPdfRequest) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (payment.status !== "approved") return null;

  const download = async () => {
    setBusy(true);
    try {
      await downloadChitReceipt(enrollment, payments, payment, business);
    } catch (error) {
      console.error("Receipt failed:", error);
      toast.error("Could not create the receipt. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-card-border/20 px-2 py-1 text-xs font-semibold hover:bg-background/60 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-primary-orange" />}
        Receipt
      </button>
      {onShare && (
        <button
          type="button"
          onClick={() => onShare(chitReceiptShareRequest(enrollment, payments, payment, business))}
          className="flex items-center gap-1 rounded-lg border border-green-600/30 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
        >
          <MessageCircle className="w-3.5 h-3.5" /> Send on WhatsApp
        </button>
      )}
    </div>
  );
}
