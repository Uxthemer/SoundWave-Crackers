import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { bonusMonth, chitError, enrollInPlan, ordinal, planMonth, rupees, type ChitPlan } from "../../lib/chit";
import { Sheet, inputClass } from "./chitUi";

/**
 * Joining a plan: the terms once more, the member's name and phone (filled
 * from their profile), and a tick to agree. The request then waits for a
 * superadmin, who is told at once.
 */
export function EnrollModal({
  plan,
  defaultName,
  defaultPhone,
  onClose,
  onDone,
}: {
  plan: ChitPlan;
  defaultName: string;
  defaultPhone: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await enrollInPlan(plan.id, name, phone, note);
      toast.success("Request sent! We'll confirm your enrolment shortly.", { duration: 6000 });
      onDone();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={`Join ${plan.name}`}
      subtitle={`${rupees(plan.monthly_amount)} a month for ${plan.months} months`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-card hover:bg-card/70">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !agreed || !name.trim() || phone.replace(/\D/g, "").length < 10}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-orange text-white font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Send request
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center mb-5">
        {[
          ["You pay", rupees(plan.total_paid)],
          [bonusMonth(plan) ? `We pay month ${bonusMonth(plan)}` : "Bonus", rupees(plan.bonus_amount)],
          ["You get", rupees(plan.total_value)],
        ].map(([label, value], i) => (
          <div key={label} className={`rounded-xl p-2.5 ${i === 2 ? "bg-primary-orange/10" : "bg-card"}`}>
            <p className="text-[11px] text-text/60">{label}</p>
            <p className={`font-bold tabular-nums ${i === 2 ? "text-primary-orange" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-text/60 mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-text/60 mb-1">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className={inputClass}
            autoComplete="tel"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-text/60 mb-1">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know"
            className={inputClass}
          />
        </label>

        <ul className="text-xs text-text/60 space-y-1 bg-card rounded-xl p-3">
          <li>• Pay {rupees(plan.monthly_amount)} by the {plan.due_day}th of each month by UPI or bank transfer.</li>
          <li>• Upload the payment screenshot with the transaction ID on this page.</li>
          <li>• Your chit starts once we approve this request. We'll email you.</li>
          {plan.starts_on && (
            <li>
              • The scheme runs from {planMonth(plan.starts_on)}
              {plan.ends_on && ` to ${planMonth(plan.ends_on)}`}
              {bonusMonth(plan) && `; we pay the ${ordinal(bonusMonth(plan)!)} month`}.
            </li>
          )}
          {plan.dispatch_on && (
            <li>
              • Crackers are dispatched in {planMonth(plan.dispatch_on)}, to members who complete every
              payment.
            </li>
          )}
        </ul>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary-orange"
          />
          <span>I agree to pay {rupees(plan.monthly_amount)} every month for {plan.months} months.</span>
        </label>
      </div>
    </Sheet>
  );
}
