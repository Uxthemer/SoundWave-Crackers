import { CalendarDays, Check, Gift, Sparkles, Truck } from "lucide-react";
import { bonusMonth, ordinal, planMonth, rupees, type ChitPlan } from "../../lib/chit";

/**
 * One plan, as a card: the monthly figure large, then what goes in and what
 * comes out. `joined` replaces the button when the member is already on it.
 */
export function PlanCard({
  plan,
  members,
  featured = false,
  joined = false,
  onJoin,
}: {
  plan: ChitPlan;
  members?: number;
  featured?: boolean;
  joined?: boolean;
  onJoin: (plan: ChitPlan) => void;
}) {
  const seatsLeft = plan.max_members ? Math.max(plan.max_members - (members ?? 0), 0) : null;
  const full = seatsLeft === 0;
  const bonusPercent = plan.total_paid > 0 ? Math.round((plan.bonus_amount / plan.total_paid) * 100) : 0;
  // "We pay the 10th month" when the bonus is exactly one more installment.
  const freeMonth = bonusMonth(plan);
  const starts = planMonth(plan.starts_on);
  const dispatch = planMonth(plan.dispatch_on);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-card p-5 transition-shadow hover:shadow-lg ${
        featured ? "border-primary-orange shadow-md" : "border-card-border/15"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-5 flex items-center gap-1 rounded-full bg-primary-orange px-3 py-1 text-[11px] font-bold text-white shadow">
          <Sparkles className="h-3 w-3" /> Most popular
        </span>
      )}

      <p className="text-sm font-semibold text-text/70">
        {plan.name}
        {plan.season_label && (
          <span className="ml-2 rounded-full bg-primary-orange/10 px-2 py-0.5 text-[11px] font-semibold text-primary-orange">
            {plan.season_label}
          </span>
        )}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-heading text-4xl">{rupees(plan.monthly_amount)}</span>
        <span className="text-sm text-text/60">/ month</span>
      </div>
      <p className="text-sm text-text/60">for {plan.months} months</p>

      <div className="mt-4 space-y-2 rounded-xl bg-background/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-text/60">You pay</span>
          <span className="font-semibold tabular-nums">{rupees(plan.total_paid)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1 text-text/60">
            <Gift className="h-3.5 w-3.5 text-primary-orange" />
            {freeMonth ? `We pay the ${ordinal(freeMonth)} month` : "Bonus"}
          </span>
          <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">
            + {rupees(plan.bonus_amount)}
            {!freeMonth && bonusPercent > 0 && <span className="ml-1 text-xs font-normal">({bonusPercent}%)</span>}
          </span>
        </div>
        <div className="flex justify-between border-t border-card-border/20 pt-2">
          <span className="font-semibold">You get crackers worth</span>
          <span className="font-bold tabular-nums text-primary-orange">{rupees(plan.total_value)}</span>
        </div>
      </div>

      {(starts || dispatch) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/70">
          {starts && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-primary-orange" /> Starts {starts}
            </span>
          )}
          {dispatch && (
            <span className="flex items-center gap-1">
              <Truck className="h-3.5 w-3.5 text-primary-orange" /> Crackers in {dispatch}
            </span>
          )}
        </div>
      )}

      {plan.description && <p className="mt-3 text-sm text-text/70">{plan.description}</p>}

      {plan.features.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-5">
        {seatsLeft !== null && !joined && (
          <p className={`mb-2 text-center text-xs ${seatsLeft <= 5 ? "text-red-600 font-semibold" : "text-text/50"}`}>
            {full ? "This plan is full" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}
          </p>
        )}
        <button
          onClick={() => onJoin(plan)}
          disabled={joined || full}
          className={`w-full rounded-xl py-3 font-semibold transition-colors disabled:cursor-not-allowed ${
            joined
              ? "bg-green-100 text-green-700"
              : featured
                ? "bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-50"
                : "bg-text/90 text-background hover:bg-text disabled:opacity-40"
          }`}
        >
          {joined ? "You've joined this plan" : full ? "Full" : "Join this plan"}
        </button>
      </div>
    </div>
  );
}
