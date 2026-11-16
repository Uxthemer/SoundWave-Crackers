import type { ReactNode } from "react";
import { format } from "date-fns";
import { monthLabel, rupees, type ChitPayment, type ChitSummary } from "../../lib/chit";
import { MONTH_STYLE, PaymentPill, ScreenshotButton } from "./chitUi";

/**
 * The parts of a chit both the member and the superadmin look at: the months
 * as a grid of tiles, and every payment with its state.
 */

export function ScheduleGrid({ summary }: { summary: ChitSummary }) {
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
        {summary.schedule.map((m) => {
          const [label, style] = MONTH_STYLE[m.state];
          return (
            <div
              key={m.index}
              title={`${monthLabel(m.month)} · due by ${format(m.dueDate, "dd MMM")} · ${label}`}
              className={`rounded-lg px-1.5 py-1.5 text-center ${style}`}
            >
              <p className="text-[11px] font-bold leading-tight">{format(m.month, "MMM")}</p>
              <p className="text-[10px] opacity-80 leading-tight">{label}</p>
            </div>
          );
        })}
      </div>
      {!summary.scheduled && (
        <p className="mt-2 text-xs text-text/50">
          Months are counted from when your enrolment is approved.
        </p>
      )}
    </div>
  );
}

export function PaymentList({
  payments,
  renderActions,
}: {
  payments: ChitPayment[];
  /** The superadmin's approve/reject controls, for a pending payment. */
  renderActions?: (payment: ChitPayment) => ReactNode;
}) {
  if (payments.length === 0) {
    return <p className="text-sm text-text/50 py-2">No payments yet.</p>;
  }
  return (
    <ul className="divide-y divide-card-border/10">
      {payments.map((p) => {
        const counted = p.status === "approved" ? p.approved_amount ?? p.amount : p.amount;
        return (
          <li key={p.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums">
                  {rupees(counted)}
                  {p.status === "approved" && p.approved_amount !== null && p.approved_amount !== p.amount && (
                    <span className="ml-1.5 text-xs font-normal text-text/50 line-through">{rupees(p.amount)}</span>
                  )}
                </p>
                <p className="text-xs text-text/60 break-all">
                  {format(new Date(p.paid_on), "dd MMM yyyy")}
                  {p.method && ` · ${p.method}`}
                  {p.transaction_ref && ` · ${p.transaction_ref}`}
                  {p.recorded_by_admin && " · recorded by us"}
                </p>
                {(p.user_note || p.admin_note) && (
                  <p className="text-xs text-text/60 mt-0.5">
                    {p.user_note && <span>“{p.user_note}” </span>}
                    {p.admin_note && <span className="text-text/80">— {p.admin_note}</span>}
                  </p>
                )}
                <ScreenshotButton path={p.screenshot_path} className="mt-1" />
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <PaymentPill status={p.status} />
              </div>
            </div>
            {renderActions && p.status === "pending" && <div className="mt-2">{renderActions(p)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
