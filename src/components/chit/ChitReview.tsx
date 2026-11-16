import { useState } from "react";
import { format } from "date-fns";
import { Check, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  chitError,
  monthLabel,
  reviewEnrollment,
  reviewPayment,
  rupees,
  type ChitEnrollment,
  type ChitPayment,
} from "../../lib/chit";
import { ConfirmDialog, inputClass } from "./chitUi";

/**
 * The superadmin's approve / reject controls. Used in the approvals queue and
 * inside a member's detail, so a payment is reviewed the same way wherever it
 * is found. The database refuses a second review, so two superadmins pressing
 * at once cannot both count the money.
 *
 * Neither button acts on its own: each asks for confirmation first, saying
 * what will happen -- the amount that will count, the month the chit will
 * start, that the member will be emailed. Approving money is not undone by
 * the app, and a rejection mail cannot be recalled.
 */

type Pending = "approve" | "reject" | null;

const ReviewButtons = ({ onPick, disabled }: { onPick: (choice: "approve" | "reject") => void; disabled: boolean }) => (
  <div className="flex gap-2">
    <button
      onClick={() => onPick("reject")}
      disabled={disabled}
      className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40"
    >
      <X className="w-4 h-4" />
      Reject
    </button>
    <button
      onClick={() => onPick("approve")}
      disabled={disabled}
      className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
    >
      <Check className="w-4 h-4" />
      Approve
    </button>
  </div>
);

export function PaymentReview({
  payment,
  memberName,
  onDone,
}: {
  payment: ChitPayment;
  /** Named in the confirmation, so the right person's money is being approved. */
  memberName?: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const value = Number(amount);

  const pick = (choice: "approve" | "reject") => {
    if (choice === "approve" && !(value > 0)) {
      toast.error("Enter the amount to approve.");
      return;
    }
    setConfirming(choice);
  };

  const act = async () => {
    const approve = confirming === "approve";
    setBusy(true);
    try {
      await reviewPayment(payment.id, approve, approve ? value : null, note);
      toast.success(approve ? `${rupees(value)} approved` : "Payment rejected");
      setConfirming(null);
      onDone();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setBusy(false);
    }
  };

  const who = memberName ? ` from ${memberName}` : "";
  const changed = Math.abs(value - payment.amount) > 0.005;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          aria-label="Amount to approve"
          title="The amount that counts. Change it if the screenshot shows a different figure."
          className={`${inputClass} sm:w-28 no-spinner`}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the member (optional)"
          className={`${inputClass} flex-1`}
        />
        <ReviewButtons onPick={pick} disabled={busy} />
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming === "approve" ? "Approve this payment?" : "Reject this payment?"}
          confirmLabel={confirming === "approve" ? `Approve ${rupees(value)}` : "Reject payment"}
          tone={confirming}
          busy={busy}
          onConfirm={act}
          onCancel={() => setConfirming(null)}
        >
          {confirming === "approve" ? (
            <>
              <p>
                <b>{rupees(value)}</b>
                {who} will be added to the chit and the months it covers marked paid.
              </p>
              {changed && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  The member entered {rupees(payment.amount)}; you are approving {rupees(value)}.
                </p>
              )}
              <p className="text-text/60">
                Transaction {payment.transaction_ref || "—"} · the member will be emailed.
              </p>
            </>
          ) : (
            <>
              <p>
                The {rupees(payment.amount)} payment{who} will be rejected and will not count towards the chit.
              </p>
              {note.trim() ? (
                <p className="text-text/60">The member will be emailed with your note: “{note.trim()}”.</p>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  No reason given. The member will be emailed without one — add a note first if you can.
                </p>
              )}
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

export function EnrollmentReview({
  enrollment,
  planStartsOn,
  onDone,
}: {
  enrollment: ChitEnrollment;
  /** The plan's first month, when it has one. */
  planStartsOn?: string | null;
  onDone: () => void;
}) {
  // The first installment's month: the scheme's start if that is still ahead
  // (someone joining in November for a December scheme), else this month.
  const thisMonth = format(new Date(), "yyyy-MM");
  const schemeStart = planStartsOn?.slice(0, 7);
  const [startMonth, setStartMonth] = useState(
    schemeStart && schemeStart > thisMonth ? schemeStart : thisMonth
  );
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const act = async () => {
    const approve = confirming === "approve";
    setBusy(true);
    try {
      await reviewEnrollment(enrollment.id, approve, approve ? `${startMonth}-01` : null, note);
      toast.success(approve ? `${enrollment.member_name} is enrolled` : "Request rejected");
      setConfirming(null);
      onDone();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex items-center gap-2 text-sm sm:w-auto">
          <span className="text-text/60 whitespace-nowrap">First month</span>
          <input
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className={`${inputClass} sm:w-40`}
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the member (optional)"
          className={`${inputClass} flex-1`}
        />
        <ReviewButtons onPick={(choice) => (startMonth || choice === "reject" ? setConfirming(choice) : toast.error("Choose the first month."))} disabled={busy} />
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming === "approve" ? "Approve this enrolment?" : "Reject this enrolment?"}
          confirmLabel={confirming === "approve" ? "Approve & enrol" : "Reject request"}
          tone={confirming}
          busy={busy}
          onConfirm={act}
          onCancel={() => setConfirming(null)}
        >
          {confirming === "approve" ? (
            <>
              <p>
                <b>{enrollment.member_name}</b> will join <b>{enrollment.plan_name}</b>:{" "}
                {rupees(enrollment.monthly_amount)} a month for {enrollment.months} months.
              </p>
              <p>
                First installment: <b>{monthLabel(new Date(`${startMonth}-01T00:00:00`))}</b>, due by the{" "}
                {enrollment.due_day}th.
              </p>
              <p className="text-text/60">They can start paying straight away and will be emailed.</p>
            </>
          ) : (
            <>
              <p>
                <b>{enrollment.member_name}</b>'s request to join <b>{enrollment.plan_name}</b> will be rejected.
              </p>
              {note.trim() ? (
                <p className="text-text/60">They will be emailed with your note: “{note.trim()}”.</p>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  No reason given. They will be emailed without one — add a note first if you can.
                </p>
              )}
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
