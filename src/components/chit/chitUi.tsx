import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { screenshotUrl, type EnrollmentStatus, type MonthState, type PaymentStatus } from "../../lib/chit";

/** Small shared pieces for the chit screens: status pills, sheets, the screenshot viewer. */

const ENROLLMENT_PILL: Record<EnrollmentStatus, [string, string]> = {
  pending: ["Awaiting approval", "bg-amber-100 text-amber-800"],
  active: ["Active", "bg-green-100 text-green-700"],
  completed: ["Completed", "bg-blue-100 text-blue-700"],
  cancelled: ["Cancelled", "bg-gray-200 text-gray-600"],
  rejected: ["Not approved", "bg-red-100 text-red-700"],
};

const PAYMENT_PILL: Record<PaymentStatus, [string, string]> = {
  pending: ["Verifying", "bg-amber-100 text-amber-800"],
  approved: ["Approved", "bg-green-100 text-green-700"],
  rejected: ["Rejected", "bg-red-100 text-red-700"],
};

export const MONTH_STYLE: Record<MonthState, [string, string]> = {
  paid: ["Paid", "bg-green-500 text-white"],
  partial: ["Part paid", "bg-green-200 text-green-900"],
  submitted: ["Verifying", "bg-amber-200 text-amber-900"],
  overdue: ["Overdue", "bg-red-500 text-white"],
  due: ["Due", "bg-primary-orange text-white"],
  upcoming: ["Upcoming", "bg-card text-text/60 border border-card-border/20"],
};

export function EnrollmentPill({ status }: { status: EnrollmentStatus }) {
  const [label, style] = ENROLLMENT_PILL[status] ?? [status, "bg-gray-100"];
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}>{label}</span>;
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  const [label, style] = PAYMENT_PILL[status] ?? [status, "bg-gray-100"];
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${style}`}>{label}</span>;
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 rounded-full bg-card-border/20 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary-orange to-primary-red transition-all"
        style={{ width: `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` }}
      />
    </div>
  );
}

/**
 * A dialog that is a bottom sheet on a phone and a centred card from sm up:
 * the thumb reaches the buttons, and the keyboard pushes the sheet, not the
 * page.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-background w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92vh] shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-card-border/10">
          <div className="min-w-0">
            <h2 className="font-heading text-xl">{title}</h2>
            {subtitle && <div className="text-sm text-text/60 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-card/70" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-card-border/10 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/** Opens a payment screenshot from the private bucket through a signed link. */
export function ScreenshotButton({ path, className = "" }: { path: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  if (!path) return null;

  const show = async () => {
    setOpen(true);
    if (url) return;
    setLoading(true);
    try {
      setUrl(await screenshotUrl(path));
    } catch {
      setUrl(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={`text-xs font-semibold text-primary-orange hover:underline ${className}`}
      >
        View screenshot
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          ) : url ? (
            <img
              src={url}
              alt="Payment screenshot"
              className="max-h-[88vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="text-white">The screenshot could not be opened.</p>
          )}
        </div>
      )}
    </>
  );
}

export const inputClass =
  "w-full px-3 py-2.5 rounded-xl bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange text-base sm:text-sm";

/**
 * "Are you sure?" for the superadmin's approvals and rejections. Approving
 * counts money and emails the member; rejecting emails them too -- neither
 * should happen from a stray tap on a phone. The dialog says exactly what
 * will happen, and sits above any open sheet.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  tone,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone: "approve" | "reject";
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-background p-5 shadow-2xl"
      >
        <h3 className="font-heading text-xl mb-2">{title}</h3>
        <div className="text-sm text-text/80 space-y-2">{children}</div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-xl bg-card hover:bg-card/70 disabled:opacity-40"
          >
            Go back
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50 ${
              tone === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
