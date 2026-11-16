import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { chitError, rupees, savePlan, type ChitPlan } from "../../lib/chit";
import { Sheet, inputClass } from "./chitUi";
import { PlanCard } from "./PlanCard";

/**
 * Creating or editing a plan, with the customer's card drawn live beside the
 * form so the figures are checked as they will be read. Editing a plan does
 * not touch anyone already on it: their terms were copied when they joined.
 */
export function ChitPlanForm({
  plan,
  onClose,
  onSaved,
}: {
  plan: ChitPlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    monthly_amount: String(plan?.monthly_amount ?? ""),
    months: String(plan?.months ?? 10),
    bonus_amount: String(plan?.bonus_amount ?? ""),
    due_day: String(plan?.due_day ?? 10),
    max_members: plan?.max_members ? String(plan.max_members) : "",
    display_order: String(plan?.display_order ?? 0),
    features: (plan?.features ?? ["Free delivery", "Bonus crackers"]).join("\n"),
    is_active: plan?.is_active ?? true,
    // Month pickers hold "2026-12"; the plan stores the 1st of the month.
    season_label: plan?.season_label ?? "",
    starts_on: plan?.starts_on?.slice(0, 7) ?? "",
    ends_on: plan?.ends_on?.slice(0, 7) ?? "",
    dispatch_on: plan?.dispatch_on?.slice(0, 7) ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const monthly = Number(form.monthly_amount) || 0;
  const months = Math.round(Number(form.months) || 0);
  const bonus = Number(form.bonus_amount) || 0;
  const preview: ChitPlan = {
    id: plan?.id ?? "preview",
    name: form.name || (monthly ? `${rupees(monthly)} a month` : "New plan"),
    description: form.description || null,
    monthly_amount: monthly,
    months,
    bonus_amount: bonus,
    total_paid: monthly * months,
    total_value: monthly * months + bonus,
    due_day: Number(form.due_day) || 10,
    features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
    max_members: Number(form.max_members) || null,
    is_active: form.is_active,
    display_order: Number(form.display_order) || 0,
    season_label: form.season_label || null,
    starts_on: form.starts_on ? `${form.starts_on}-01` : null,
    ends_on: form.ends_on ? `${form.ends_on}-01` : null,
    dispatch_on: form.dispatch_on ? `${form.dispatch_on}-01` : null,
  };

  const problem =
    !form.name.trim()
      ? "Give the plan a name."
      : !(monthly > 0)
        ? "Enter the monthly amount."
        : !(months >= 1 && months <= 60)
          ? "Months must be between 1 and 60."
          : bonus < 0
            ? "The bonus cannot be negative."
            : !(preview.due_day >= 1 && preview.due_day <= 28)
              ? "The due day must be between 1 and 28."
              : form.starts_on && form.ends_on && form.ends_on < form.starts_on
                ? "The scheme cannot end before it starts."
                : null;

  const save = async () => {
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await savePlan({ ...preview, id: plan?.id });
      toast.success(plan ? "Plan updated" : "Plan created");
      onSaved();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, props: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="block text-xs font-medium text-text/60 mb-1">{label}</span>
      <input
        value={form[key] as string}
        onChange={(e) => set(key)(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        className={`${inputClass} no-spinner`}
        {...props}
      />
    </label>
  );

  return (
    <Sheet
      title={plan ? "Edit plan" : "New plan"}
      subtitle={plan ? "Members already on this plan keep the terms they joined with." : undefined}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-card hover:bg-card/70">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-orange text-white font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {plan ? "Save plan" : "Create plan"}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {field("Plan name", "name", { placeholder: "e.g. Silver – ₹1,000 a month" })}
          <div className="grid grid-cols-2 gap-3">
            {field("Monthly amount (₹)", "monthly_amount", { type: "number", inputMode: "decimal", min: 1 })}
            {field("Months", "months", { type: "number", inputMode: "numeric", min: 1, max: 60 })}
            {field("Bonus (₹)", "bonus_amount", { type: "number", inputMode: "decimal", min: 0 })}
            {field("Due by day of month", "due_day", { type: "number", inputMode: "numeric", min: 1, max: 28 })}
            {field("Max members (blank = no limit)", "max_members", { type: "number", inputMode: "numeric", min: 1 })}
            {field("Display order", "display_order", { type: "number", inputMode: "numeric" })}
          </div>
          <div className="rounded-xl bg-card p-3 text-sm grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-text/60">Member pays</p>
              <p className="font-bold tabular-nums">{rupees(preview.total_paid)}</p>
            </div>
            <div>
              <p className="text-[11px] text-text/60">Bonus</p>
              <p className="font-bold tabular-nums">{rupees(bonus)}</p>
            </div>
            <div>
              <p className="text-[11px] text-text/60">Total value</p>
              <p className="font-bold tabular-nums text-primary-orange">{rupees(preview.total_value)}</p>
            </div>
          </div>
          {/* The scheme's calendar: shown on the card and the chit page, and
              the first month offered when approving a member. */}
          <div className="rounded-xl border border-card-border/20 p-3 space-y-3">
            <p className="text-xs font-semibold text-text/70">Scheme dates (optional)</p>
            {field("Season", "season_label", { placeholder: "e.g. Diwali 2027" })}
            <div className="grid grid-cols-3 gap-2">
              {field("Starts", "starts_on", { type: "month" })}
              {field("Ends", "ends_on", { type: "month" })}
              {field("Crackers sent", "dispatch_on", { type: "month" })}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-text/60 mb-1">Short description (optional)</span>
            <input value={form.description} onChange={(e) => set("description")(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-text/60 mb-1">Features — one per line</span>
            <textarea
              value={form.features}
              onChange={(e) => set("features")(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active")(e.target.checked)}
              className="w-4 h-4 accent-primary-orange"
            />
            Open for joining (shown on the chit page)
          </label>
        </div>
        <div className="hidden md:block">
          <p className="text-xs font-semibold text-text/60 mb-2">How customers see it</p>
          <PlanCard plan={preview} onJoin={() => undefined} />
        </div>
      </div>
    </Sheet>
  );
}
