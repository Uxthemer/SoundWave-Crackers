import { useRef, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, ImagePlus, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { UPI_ID } from "../../lib/paymentDetails";
import { PAYMENT_METHODS, chitError, rupees, submitPayment, type ChitEnrollment } from "../../lib/chit";
import { Sheet, inputClass } from "./chitUi";

/**
 * Paying an installment: where to pay (the same UPI ID and QR as the cart),
 * then the amount, the app used, the transaction ID and the screenshot. The
 * amount starts at what is due now, or one month if nothing is.
 */
export function PaymentModal({
  enrollment,
  userId,
  suggested,
  onClose,
  onDone,
}: {
  enrollment: ChitEnrollment;
  userId: string;
  suggested: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(suggested || enrollment.monthly_amount));
  const [method, setMethod] = useState("GPay");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      toast.error("Please choose an image of the payment.");
      return;
    }
    setFile(picked);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(picked);
    });
  };

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Please select the UPI ID and copy it.");
    }
  };

  const value = Number(amount);
  const ready = value > 0 && reference.trim() && file && !saving;

  const submit = async () => {
    if (!file) return;
    setSaving(true);
    try {
      await submitPayment({
        enrollmentId: enrollment.id,
        userId,
        amount: value,
        method,
        transactionRef: reference.trim(),
        paidOn,
        note,
        screenshot: file,
      });
      toast.success("Payment submitted. We'll verify it and let you know.", { duration: 6000 });
      onDone();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Submit a payment"
      subtitle={enrollment.plan_name}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-card hover:bg-card/70">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-orange text-white font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Uploading…" : `Submit ${value > 0 ? rupees(value) : ""}`}
          </button>
        </>
      }
    >
      {/* Where to pay. */}
      <div className="flex gap-3 items-center rounded-xl bg-card p-3 mb-4">
        <img
          src="/assets/img/payment/QR-Code-payment.jpg"
          alt="UPI QR code"
          className="w-20 h-20 rounded-lg object-cover bg-white shrink-0"
        />
        <div className="min-w-0">
          <p className="text-xs text-text/60">Scan, or pay to this UPI ID</p>
          <p className="font-mono text-sm font-semibold break-all">{UPI_ID}</p>
          <button onClick={copyUpi} className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary-orange">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy UPI ID"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-text/60 mb-1">Amount paid (₹)</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={`${inputClass} no-spinner`}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-text/60 mb-1">Paid on</span>
            <input type="date" value={paidOn} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="-mt-1 text-xs text-text/50">
          Paying more than one month? Enter the whole amount; it covers the months in order.
        </p>

        <div>
          <span className="block text-xs font-medium text-text/60 mb-1.5">Paid with</span>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.filter((m) => m !== "Cash").map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  method === m
                    ? "bg-primary-orange text-white border-primary-orange"
                    : "bg-card border-card-border/20"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-text/60 mb-1">Transaction ID / UTR</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="From your payment app's receipt"
            className={`${inputClass} font-mono`}
            autoComplete="off"
          />
        </label>

        <div>
          <span className="block text-xs font-medium text-text/60 mb-1">Payment screenshot</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-card-border/30 hover:border-primary-orange/60 p-3 flex items-center gap-3 text-left"
          >
            {preview ? (
              <img src={preview} alt="Screenshot to upload" className="w-14 h-20 object-cover rounded-lg" />
            ) : (
              <span className="w-14 h-14 rounded-lg bg-card flex items-center justify-center">
                <ImagePlus className="w-6 h-6 text-primary-orange" />
              </span>
            )}
            <span className="text-sm">
              {file ? (
                <>
                  <span className="font-semibold block truncate">{file.name}</span>
                  <span className="text-text/60 text-xs">Tap to change</span>
                </>
              ) : (
                <>
                  <span className="font-semibold block">Add screenshot</span>
                  <span className="text-text/60 text-xs">The success screen showing amount and ID</span>
                </>
              )}
            </span>
          </button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-text/60 mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </label>
      </div>
    </Sheet>
  );
}
