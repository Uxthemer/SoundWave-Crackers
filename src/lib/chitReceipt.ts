import { addMonths, format, startOfMonth } from "date-fns";
import type { ChitEnrollment, ChitPayment } from "./chit";

/**
 * What a chit payment receipt says, worked out from the chit and its
 * payments. Kept apart from the drawing (chitReceiptPdf.ts) so the screens
 * can name the file and the WhatsApp message without loading jsPDF.
 *
 * Only an approved payment has a receipt: it is the superadmin's approval
 * that makes the money count, and the receipt states the amount approved.
 */

export interface ChitReceiptFacts {
  number: string;
  memberName: string;
  phone: string;
  planName: string;
  monthlyAmount: number;
  months: number;
  amount: number;
  method: string | null;
  transactionRef: string | null;
  paidOn: string;
  approvedOn: string | null;
  /** "Dec 2026" or "Dec 2026 – Jan 2027", the installments this payment filled. */
  monthsCovered: string;
  /** As it stood once this payment was counted. */
  paidSoFar: number;
  target: number;
  balance: number;
  recordedAtShop: boolean;
}

/** SWC-CR-202612-3F9A1C: the month paid, and the payment's own id. */
export const receiptNumber = (payment: Pick<ChitPayment, "id" | "paid_on">) =>
  `SWC-CR-${payment.paid_on.slice(0, 7).replace("-", "")}-${payment.id.replace(/-/g, "").slice(-6).toUpperCase()}`;

export const receiptFileName = (payment: Pick<ChitPayment, "id" | "paid_on">) =>
  `chit-receipt-${receiptNumber(payment)}.pdf`;

/**
 * Approved money fills the months in order (see chitSummary), so the months
 * this payment filled are where the approved total stood before it and after
 * it. Payments are taken in the order they were approved.
 */
export function receiptFacts(
  enrollment: ChitEnrollment,
  payments: ChitPayment[],
  payment: ChitPayment
): ChitReceiptFacts {
  const monthly = Number(enrollment.monthly_amount);
  const target = monthly * enrollment.months;
  const amount = Number(payment.approved_amount ?? payment.amount);

  const approved = payments
    .filter((p) => p.status === "approved")
    .sort((a, b) =>
      (a.reviewed_at ?? a.created_at).localeCompare(b.reviewed_at ?? b.created_at) || a.id.localeCompare(b.id)
    );
  let before = 0;
  for (const p of approved) {
    if (p.id === payment.id) break;
    before += Number(p.approved_amount ?? p.amount);
  }
  const after = before + amount;

  const start = startOfMonth(
    enrollment.start_month ? new Date(`${enrollment.start_month}T00:00:00`) : new Date(enrollment.created_at)
  );
  const firstIndex = Math.min(Math.floor(before / monthly + 1e-9), enrollment.months - 1);
  const lastIndex = Math.min(Math.ceil(after / monthly - 1e-9) - 1, enrollment.months - 1);
  const label = (i: number) => format(addMonths(start, i), "MMM yyyy");
  const monthsCovered =
    lastIndex < firstIndex || before >= target
      ? "Paid beyond the plan"
      : firstIndex === lastIndex
        ? label(firstIndex)
        : `${label(firstIndex)} – ${label(lastIndex)}`;

  return {
    number: receiptNumber(payment),
    memberName: enrollment.member_name,
    phone: enrollment.phone,
    planName: enrollment.plan_name,
    monthlyAmount: monthly,
    months: enrollment.months,
    amount,
    method: payment.method,
    transactionRef: payment.transaction_ref,
    paidOn: payment.paid_on,
    approvedOn: payment.reviewed_at,
    monthsCovered,
    paidSoFar: after,
    target,
    balance: Math.max(target - after, 0),
    recordedAtShop: payment.recorded_by_admin,
  };
}
