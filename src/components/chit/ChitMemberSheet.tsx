import { useState } from "react";
import { format } from "date-fns";
import { ArrowRightLeft, Loader2, Mail, Phone, PlusCircle, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  PAYMENT_METHODS,
  changePlan,
  chitError,
  deleteEnrollment,
  chitSummary,
  monthLabel,
  recordPayment,
  rupees,
  setEnrollmentStatus,
  type ChitEnrollment,
  type ChitPayment,
  type ChitPlan,
} from "../../lib/chit";
import { ConfirmDialog, EnrollmentPill, ProgressBar, Sheet, inputClass } from "./chitUi";
import { PaymentList, ScheduleGrid } from "./ChitDetails";
import { EnrollmentReview, PaymentReview } from "./ChitReview";

type Panel = null | "switch" | "record";

/**
 * Everything about one member's chit for the superadmin, and every action on
 * it: approve, review payments, switch plan, record a payment taken at the
 * shop, close it off.
 *
 * Switching then recording is how "moved from Rs. 500 to Rs. 1,000 a month
 * and paid the difference" is handled: after the switch, the money already in
 * covers fewer months of the bigger plan and the shortfall shows as due; the
 * difference is recorded as a payment and the months fill back up.
 */
export function ChitMemberSheet({
  enrollment,
  payments,
  plans,
  onClose,
  onChanged,
}: {
  enrollment: ChitEnrollment;
  payments: ChitPayment[];
  plans: ChitPlan[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const summary = chitSummary(enrollment, payments);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);

  // Switch plan
  const [newPlanId, setNewPlanId] = useState("");
  const [switchNote, setSwitchNote] = useState("");
  const newPlan = plans.find((p) => p.id === newPlanId);
  const afterSwitch = newPlan
    ? chitSummary({ ...enrollment, monthly_amount: newPlan.monthly_amount, months: newPlan.months }, payments)
    : null;

  // Record a payment
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recordNote, setRecordNote] = useState("");

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setPanel(null);
      onChanged();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setBusy(false);
    }
  };

  const open = enrollment.status === "active" || enrollment.status === "pending";

  // Deleting asks twice: first what will be lost, then the member's name typed
  // out, so it cannot be done by tapping the same spot twice.
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [typedName, setTypedName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const nameMatches = typedName.trim().toLowerCase() === enrollment.member_name.trim().toLowerCase();
  const approvedCount = payments.filter((p) => p.status === "approved").length;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteEnrollment(enrollment.id);
      toast.success(`${enrollment.member_name}'s chit deleted`);
      setDeleteStep(0);
      onClose();
      onChanged();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet
      title={enrollment.member_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={`tel:${enrollment.phone}`} className="flex items-center gap-1 hover:text-primary-orange">
            <Phone className="w-3.5 h-3.5" /> {enrollment.phone}
          </a>
          {enrollment.email && (
            <a href={`mailto:${enrollment.email}`} className="flex items-center gap-1 hover:text-primary-orange break-all">
              <Mail className="w-3.5 h-3.5" /> {enrollment.email}
            </a>
          )}
        </span>
      }
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        {/* Plan and standing */}
        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{enrollment.plan_name}</p>
              <p className="text-sm text-text/60">
                {rupees(enrollment.monthly_amount)} × {enrollment.months} months · bonus {rupees(enrollment.bonus_amount)}
                {enrollment.start_month && ` · from ${monthLabel(new Date(enrollment.start_month))}`}
              </p>
              <p className="text-xs text-text/50 mt-0.5">
                Requested {format(new Date(enrollment.created_at), "dd MMM yyyy")}
                {enrollment.approved_at && ` · approved ${format(new Date(enrollment.approved_at), "dd MMM yyyy")}`}
              </p>
            </div>
            <EnrollmentPill status={enrollment.status} />
          </div>
          {enrollment.user_note && <p className="mt-2 text-sm text-text/70">Member's note: “{enrollment.user_note}”</p>}

          {enrollment.status === "pending" ? (
            <div className="mt-3">
              <EnrollmentReview
                enrollment={enrollment}
                planStartsOn={plans.find((p) => p.id === enrollment.plan_id)?.starts_on}
                onDone={onChanged}
              />
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>
                    <b className="tabular-nums">{rupees(summary.paid)}</b> of {rupees(summary.target)}
                  </span>
                  <span className="text-text/60">
                    {summary.monthsPaid}/{enrollment.months} months
                  </span>
                </div>
                <ProgressBar value={summary.progress} />
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                {[
                  ["Due now", rupees(summary.dueNow), summary.dueNow > 0 ? "text-red-600" : ""],
                  ["Balance", rupees(summary.balance), ""],
                  ["Verifying", rupees(summary.awaiting), summary.awaiting > 0 ? "text-amber-700" : ""],
                  [summary.extra > 0 ? "Paid extra" : "Overdue months", summary.extra > 0 ? rupees(summary.extra) : String(summary.overdueMonths), summary.overdueMonths > 0 ? "text-red-600" : ""],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl bg-background/60 p-2.5">
                    <p className="text-[11px] text-text/60">{label}</p>
                    <p className={`font-bold tabular-nums ${tone}`}>{value}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {enrollment.status !== "pending" && enrollment.status !== "rejected" && (
          <div className="flex flex-wrap gap-2">
            {open && (
              <button
                onClick={() => setPanel(panel === "switch" ? null : "switch")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border ${panel === "switch" ? "border-primary-orange bg-primary-orange/10" : "border-card-border/20"}`}
              >
                <ArrowRightLeft className="w-4 h-4" /> Switch plan
              </button>
            )}
            <button
              onClick={() => setPanel(panel === "record" ? null : "record")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border ${panel === "record" ? "border-primary-orange bg-primary-orange/10" : "border-card-border/20"}`}
            >
              <PlusCircle className="w-4 h-4" /> Record a payment
            </button>
            <select
              value={enrollment.status}
              disabled={busy}
              onChange={(e) =>
                run(
                  () => setEnrollmentStatus(enrollment.id, e.target.value as "active" | "completed" | "cancelled", ""),
                  "Status updated"
                )
              }
              className="px-3 py-2 rounded-xl text-sm border border-card-border/20 bg-background"
              aria-label="Chit status"
            >
              <option value="active">Active</option>
              <option value="completed">Completed (redeemed)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}

        {panel === "switch" && (
          <div className="rounded-2xl border border-primary-orange/40 p-4 space-y-3">
            <p className="font-semibold text-sm">Move {enrollment.member_name} to another plan</p>
            <select value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)} className={inputClass}>
              <option value="">Choose the new plan…</option>
              {plans
                .filter((p) => p.id !== enrollment.plan_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {rupees(p.monthly_amount)} × {p.months}
                    {p.is_active ? "" : " (closed)"}
                  </option>
                ))}
            </select>
            {afterSwitch && newPlan && (
              <p className="text-sm text-text/70 bg-card rounded-xl p-3">
                The {rupees(summary.paid)} already paid will cover <b>{afterSwitch.monthsPaid}</b> of {newPlan.months}{" "}
                months at {rupees(newPlan.monthly_amount)}.{" "}
                {afterSwitch.dueNow > 0 ? (
                  <>
                    <b className="text-red-600">{rupees(afterSwitch.dueNow)}</b> will be due to bring it up to date — record
                    it once paid.
                  </>
                ) : (
                  "Nothing extra will be due right now."
                )}
              </p>
            )}
            <input
              value={switchNote}
              onChange={(e) => setSwitchNote(e.target.value)}
              placeholder="Reason (kept with the chit)"
              className={inputClass}
            />
            <button
              onClick={() => run(() => changePlan(enrollment.id, newPlanId, switchNote), "Plan switched")}
              disabled={!newPlanId || busy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-orange text-white font-semibold disabled:opacity-40"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Switch plan
            </button>
          </div>
        )}

        {panel === "record" && (
          <div className="rounded-2xl border border-primary-orange/40 p-4 space-y-3">
            <p className="font-semibold text-sm">Record a payment received</p>
            <p className="text-xs text-text/60 -mt-2">
              Approved as entered: cash at the shop, or the difference after a plan switch. The member is emailed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder={`Amount (due ${rupees(summary.dueNow)})`}
                className={`${inputClass} no-spinner`}
              />
              <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${method === m ? "bg-primary-orange text-white border-primary-orange" : "bg-card border-card-border/20"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID (optional)" className={inputClass} />
              <input value={recordNote} onChange={(e) => setRecordNote(e.target.value)} placeholder="Note (optional)" className={inputClass} />
            </div>
            <button
              onClick={() =>
                run(
                  () =>
                    recordPayment({
                      enrollmentId: enrollment.id,
                      amount: Number(amount),
                      method,
                      transactionRef: reference,
                      paidOn,
                      note: recordNote,
                    }),
                  "Payment recorded"
                )
              }
              disabled={!(Number(amount) > 0) || busy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-40"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Record {Number(amount) > 0 ? rupees(Number(amount)) : ""}
            </button>
          </div>
        )}

        {enrollment.status !== "pending" && (
          <div>
            <p className="text-sm font-semibold mb-2">Months</p>
            <ScheduleGrid summary={summary} />
          </div>
        )}

        <div>
          <p className="text-sm font-semibold mb-1">Payments ({payments.length})</p>
          <PaymentList payments={payments} renderActions={(p) => <PaymentReview payment={p} memberName={enrollment.member_name} onDone={onChanged} />} />
        </div>

        {enrollment.plan_history.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-1">Plan changes</p>
            <ul className="text-sm space-y-1">
              {enrollment.plan_history.map((h, i) => (
                <li key={i} className="text-text/70">
                  {format(new Date(h.at), "dd MMM yyyy")}: {h.from.name} ({rupees(h.from.monthly_amount)}) → {h.to.name} (
                  {rupees(h.to.monthly_amount)}){h.note && ` — ${h.note}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {enrollment.admin_note && <p className="text-sm text-text/60">Admin note: {enrollment.admin_note}</p>}

        {/* Kept apart from the everyday actions, at the bottom. */}
        <div className="pt-4 border-t border-card-border/10">
          <button
            onClick={() => {
              setTypedName("");
              setDeleteStep(1);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-red-300 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Delete this chit
          </button>
          <p className="mt-1 text-xs text-text/50">
            For a mistaken or duplicate enrolment. To end a real member's chit, set it to Cancelled instead —
            that keeps the history.
          </p>
        </div>
      </div>

      {deleteStep === 1 && (
        <ConfirmDialog
          title="Delete this chit?"
          confirmLabel="Continue"
          tone="reject"
          busy={false}
          onConfirm={() => setDeleteStep(2)}
          onCancel={() => setDeleteStep(0)}
        >
          <p>
            <b>{enrollment.member_name}</b>'s <b>{enrollment.plan_name}</b> chit will be deleted permanently,
            together with:
          </p>
          <ul className="list-disc pl-5">
            <li>
              {payments.length} payment{payments.length === 1 ? "" : "s"}
              {approvedCount > 0 && (
                <>
                  , including <b>{approvedCount} approved ({rupees(summary.paid)})</b> — this money will leave every
                  total
                </>
              )}
            </li>
            <li>their payment screenshots</li>
          </ul>
          <p className="text-text/60">This cannot be undone. The member is not emailed.</p>
        </ConfirmDialog>
      )}

      {deleteStep === 2 && (
        <ConfirmDialog
          title="Are you absolutely sure?"
          confirmLabel="Delete permanently"
          tone="reject"
          busy={deleting}
          onConfirm={() => (nameMatches ? confirmDelete() : toast.error("Type the member's name to confirm."))}
          onCancel={() => setDeleteStep(0)}
        >
          <p>
            Type <b>{enrollment.member_name}</b> to confirm.
          </p>
          <input
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={enrollment.member_name}
            aria-label="Member's name"
            className={`${inputClass} ${typedName && !nameMatches ? "border-red-400" : ""}`}
          />
        </ConfirmDialog>
      )}
    </Sheet>
  );
}
