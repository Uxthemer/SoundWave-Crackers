import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Paperclip,
  X,
} from "lucide-react";
import {
  appChatUrl,
  canShareFiles,
  downloadFile,
  shareFile,
  webChatUrl,
  whatsappNumber,
} from "../lib/whatsappShare";

/**
 * Sends an order's PDF -- the summary or the invoice -- to any WhatsApp
 * number, as the file itself: no upload, no link, no Cloud API.
 *
 * A web page cannot put a file into a chat it opens (see whatsappShare.ts),
 * and the share sheet that can carry the file cannot be told which chat. So
 * it is two steps, and the first one is what makes the second work:
 *
 *   1. Open the chat with the number typed here. WhatsApp opens it whether
 *      or not the number is saved as a contact, and from then on that chat
 *      sits at the top of the recent chats.
 *   2. Attach the PDF through the share sheet: WhatsApp, then that chat,
 *      which is now the first one listed. Where there is no share sheet
 *      (most desktop browsers), the PDF is downloaded to be dragged in.
 *
 * The PDF is built as soon as a document is picked rather than on the
 * attach click: the share sheet only opens straight from a tap, and a
 * browser stops counting it as one if the page spends a second drawing the
 * PDF first.
 */

export interface PdfDocumentChoice {
  key: string;
  /** "Order summary", "Invoice" -- the choice as the user sees it. */
  label: string;
  fileName: string;
  /** Typed into the chat in step 1; the PDF follows it in step 2. */
  message: string;
  makePdf: () => Promise<Blob>;
}

export interface SendPdfRequest {
  /** "Order SWCO2026…" — shown in the header. */
  title: string;
  customerName: string;
  /** Pre-filled into the number box; any other number can be typed over it. */
  phone: string | null | undefined;
  documents: PdfDocumentChoice[];
}

type PdfState =
  | { state: "building" }
  | { state: "ready"; blob: Blob }
  | { state: "failed"; error: string };

/** The number as it is shown in the box: the 10 digits, without the 91. */
function localDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function SendPdfOnWhatsAppDialog({
  request,
  onClose,
}: {
  request: SendPdfRequest | null;
  onClose: () => void;
}) {
  const [docKey, setDocKey] = useState<string>("");
  const [numberInput, setNumberInput] = useState("");
  const [pdfs, setPdfs] = useState<Record<string, PdfState>>({});
  const [chatOpened, setChatOpened] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // A new request starts clean: its own number, its first document.
  useEffect(() => {
    if (!request) return;
    setDocKey(request.documents[0]?.key ?? "");
    setNumberInput(localDigits(request.phone));
    setPdfs({});
    setChatOpened(false);
    setShareError(null);
  }, [request]);

  const choice = request?.documents.find((d) => d.key === docKey) ?? null;

  // Each document is drawn once, the first time it is picked.
  useEffect(() => {
    if (!choice || pdfs[choice.key]) return;
    let cancelled = false;
    setPdfs((prev) => ({ ...prev, [choice.key]: { state: "building" } }));
    choice
      .makePdf()
      .then((blob) => {
        if (!cancelled) {
          setPdfs((prev) => ({ ...prev, [choice.key]: { state: "ready", blob } }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPdfs((prev) => ({
            ...prev,
            [choice.key]: {
              state: "failed",
              error: err instanceof Error ? err.message : "The PDF could not be made",
            },
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice?.key]);

  if (!request || !choice) return null;

  const phone = whatsappNumber(numberInput);
  const pdf = pdfs[choice.key];
  const ready = pdf?.state === "ready" ? pdf : null;
  const shareable = canShareFiles();

  const attach = async () => {
    if (!ready) return;
    setShareError(null);
    try {
      // No text with the file: the greeting already went in step 1, and
      // WhatsApp would print it a second time as the file's caption.
      await shareFile(
        new File([ready.blob], choice.fileName, { type: "application/pdf" }),
        ""
      );
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Sharing is not available here");
    }
  };

  const buttonClass =
    "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm text-left transition-colors";
  const disabledLink = "pointer-events-none opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-5 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text/60 hover:bg-card/70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 pr-8">
          <MessageCircle className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold truncate">Send PDF · {request.title}</h2>
        </div>

        {/* Which document */}
        <div className="grid grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Document">
          {request.documents.map((d) => (
            <button
              key={d.key}
              role="radio"
              aria-checked={d.key === choice.key}
              onClick={() => {
                setDocKey(d.key);
                setShareError(null);
              }}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                d.key === choice.key
                  ? "border-green-600 bg-green-50 text-green-800"
                  : "border-card-border/20 hover:bg-card/70"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* To whom */}
        <label htmlFor="send-pdf-number" className="block text-sm font-medium mb-1">
          WhatsApp number
        </label>
        <div className="flex items-stretch rounded-lg border border-card-border/20 focus-within:border-green-600 overflow-hidden mb-1">
          <span className="px-3 flex items-center text-sm text-text/60 bg-card/60 border-r border-card-border/20">
            +91
          </span>
          <input
            id="send-pdf-number"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={numberInput}
            onChange={(e) => {
              setNumberInput(e.target.value);
              setChatOpened(false);
            }}
            placeholder="10-digit mobile number"
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
          />
        </div>
        <p className="text-xs text-text/60 mb-4">
          {phone
            ? `Pre-filled with ${request.customerName || "the customer"}'s number; type any other to send it elsewhere.`
            : "Enter a 10-digit mobile number. A number from outside India needs its country code."}
        </p>

        {pdf?.state === "failed" && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {pdf.error}
          </p>
        )}

        {/* Step 1 */}
        <p className="text-xs font-semibold uppercase tracking-wide text-text/60 mb-2">
          1 · Open the chat
        </p>
        <div className="space-y-2 mb-4">
          <a
            href={phone ? appChatUrl(phone, choice.message) : undefined}
            onClick={() => setChatOpened(true)}
            aria-disabled={!phone}
            className={`${buttonClass} border-green-600/40 bg-green-600 text-white hover:bg-green-700 ${
              phone ? "" : disabledLink
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="flex-1">
              Open chat{phone ? ` with +${phone}` : ""}
            </span>
          </a>
          <a
            href={phone ? webChatUrl(phone, choice.message) : undefined}
            onClick={() => setChatOpened(true)}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!phone}
            className={`${buttonClass} border-card-border/20 hover:bg-card/70 ${
              phone ? "" : disabledLink
            }`}
          >
            <ExternalLink className="w-4 h-4 text-text/60" />
            <span className="flex-1">Use WhatsApp Web instead</span>
          </a>
        </div>

        {/* Step 2 */}
        <p className="text-xs font-semibold uppercase tracking-wide text-text/60 mb-2">
          2 · Attach the {choice.label.toLowerCase()} PDF
        </p>
        <p className="text-xs text-text/70 mb-2">
          {shareable
            ? "Choose WhatsApp, then the chat you just opened — it is at the top of the list."
            : "Download the PDF, then drag it into the chat (or use the paperclip in WhatsApp)."}
          {chatOpened ? "" : " Open the chat first if this number is not saved in your contacts."}
        </p>
        <div className="space-y-2">
          {shareable && (
            <button
              onClick={attach}
              disabled={!ready}
              className={`${buttonClass} border-green-600/40 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {ready ? (
                <Paperclip className="w-4 h-4" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span className="flex-1">
                {ready ? `Attach ${choice.fileName}` : "Preparing the PDF…"}
              </span>
            </button>
          )}
          <button
            onClick={() => ready && downloadFile(ready.blob, choice.fileName)}
            disabled={!ready}
            className={`${buttonClass} border-card-border/20 hover:bg-card/70 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {ready || shareable ? (
              <Download className="w-4 h-4 text-text/60" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-text/60" />
            )}
            <span className="flex-1">
              {ready || shareable ? `Download ${choice.fileName}` : "Preparing the PDF…"}
            </span>
          </button>
        </div>

        {shareError && <p className="mt-3 text-xs text-red-600">{shareError}</p>}
      </div>
    </div>
  );
}
