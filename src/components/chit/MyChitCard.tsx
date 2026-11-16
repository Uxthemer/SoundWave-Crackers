import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { AlertCircle, CalendarClock, ChevronDown, ChevronUp, Clock, Wallet } from "lucide-react";
import { chitSummary, monthLabel, rupees, type ChitEnrollment, type ChitPayment } from "../../lib/chit";
import { EnrollmentPill, ProgressBar } from "./chitUi";
import { ChitReceiptButtons } from "./ChitReceiptButtons";
import { useAppSettings } from "../../context/AppSettingsContext";
import { businessFromSettings } from "../../lib/businessDetails";
import { PaymentList, ScheduleGrid } from "./ChitDetails";

/**
 * One of the member's chits: where it stands at a glance, the button to pay,
 * and -- opened -- every month and every payment.
 */
export function MyChitCard({
  enrollment,
  payments,
  onPay,
}: {
  enrollment: ChitEnrollment;
  payments: ChitPayment[];
  onPay: (enrollment: ChitEnrollment, suggested: number) => void;
}) {
  const [open, setOpen] = useState(enrollment.status === "active");
  const { settings } = useAppSettings();
  const business = businessFromSettings(settings);
  const summary = chitSummary(enrollment, payments);
  const active = enrollment.status === "active";
  const fullyPaid = summary.balance <= 0.005;
  const suggested = summary.dueNow > 0 ? summary.dueNow : Math.min(enrollment.monthly_amount, summary.balance);

  return (
    <div className="rounded-2xl border border-card-border/15 bg-card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-xl truncate">{enrollment.plan_name}</p>
            <p className="text-sm text-text/60">
              {rupees(enrollment.monthly_amount)} × {enrollment.months} months
              {enrollment.start_month && ` · from ${monthLabel(new Date(enrollment.start_month))}`}
            </p>
          </div>
          <EnrollmentPill status={enrollment.status} />
        </div>

        {enrollment.status === "pending" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            We've received your request and will confirm it shortly. You can pay once it's approved.
          </p>
        )}
        {enrollment.status === "rejected" && enrollment.admin_note && (
          <p className="mt-3 text-sm text-red-700">{enrollment.admin_note}</p>
        )}

        {(active || enrollment.status === "completed") && (
          <>
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span>
                  <span className="font-bold tabular-nums">{rupees(summary.paid)}</span>
                  <span className="text-text/60"> of {rupees(summary.target)} paid</span>
                </span>
                <span className="text-text/60">
                  {summary.monthsPaid}/{enrollment.months} months
                </span>
              </div>
              <ProgressBar value={summary.progress} />
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Stat
                icon={<AlertCircle className="w-4 h-4" />}
                label="Due now"
                value={rupees(summary.dueNow)}
                tone={summary.dueNow > 0 ? (summary.overdueMonths > 0 ? "red" : "orange") : "muted"}
              />
              <Stat
                icon={<CalendarClock className="w-4 h-4" />}
                label="Next due"
                value={
                  fullyPaid
                    ? "All paid 🎉"
                    : summary.next
                      ? format(summary.next.dueDate, "dd MMM")
                      : "—"
                }
              />
              <Stat icon={<Wallet className="w-4 h-4" />} label="Balance" value={rupees(summary.balance)} />
              <Stat
                icon={<Clock className="w-4 h-4" />}
                label="Verifying"
                value={rupees(summary.awaiting)}
                tone={summary.awaiting > 0 ? "amber" : "muted"}
              />
            </div>

            {summary.overdueMonths > 0 && (
              <p className="mt-3 text-sm text-red-600 font-semibold">
                {summary.overdueMonths} month{summary.overdueMonths === 1 ? "" : "s"} overdue
              </p>
            )}

            <div className="mt-3 rounded-xl bg-primary-orange/10 p-3 text-sm flex justify-between">
              <span>At the end you get crackers worth</span>
              <span className="font-bold text-primary-orange tabular-nums">
                {rupees(summary.target + enrollment.bonus_amount)}
              </span>
            </div>

            {active && !fullyPaid && (
              <button
                onClick={() => onPay(enrollment, suggested)}
                className="mt-4 w-full rounded-xl bg-primary-orange py-3 font-semibold text-white hover:bg-primary-orange/90"
              >
                Pay {rupees(suggested)} & upload screenshot
              </button>
            )}
          </>
        )}
      </div>

      {(active || enrollment.status === "completed") && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-3 border-t border-card-border/10 text-sm font-semibold hover:bg-background/40"
          >
            Months & payments
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {open && (
            <div className="px-4 sm:px-5 pb-5 space-y-4">
              <ScheduleGrid summary={summary} />
              <div>
                <p className="text-sm font-semibold mb-1">Payment requests</p>
                <PaymentList
                  payments={payments}
                  renderReceipt={(p) => (
                    <ChitReceiptButtons enrollment={enrollment} payments={payments} payment={p} business={business} />
                  )}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "default" | "red" | "orange" | "amber" | "muted";
}) {
  const color = {
    default: "",
    red: "text-red-600",
    orange: "text-primary-orange",
    amber: "text-amber-700 dark:text-amber-400",
    muted: "text-text/50",
  }[tone];
  return (
    <div className="rounded-xl bg-background/60 p-2.5">
      <p className="flex items-center gap-1 text-[11px] text-text/60">
        {icon} {label}
      </p>
      <p className={`mt-0.5 font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
