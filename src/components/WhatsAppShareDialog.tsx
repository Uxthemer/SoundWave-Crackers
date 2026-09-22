import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Share2,
  X,
} from "lucide-react";
import {
  LINK_LIFETIME_DAYS,
  appChatUrl,
  canShareFiles,
  downloadFile,
  shareFile,
  uploadForSharing,
  webChatUrl,
  whatsappNumber,
} from "../lib/whatsappShare";

/**
 * Sends an invoice or quotation to the customer on WhatsApp.
 *
 * On open it builds the PDF, stores it, and opens WhatsApp on the customer's
 * own chat with the message and the invoice link typed in -- all the user has
 * to do is press Send. The other ways out (WhatsApp Web, the share sheet with
 * the file itself, a plain download) stay on screen in case the app did not
 * open or the file should go as an attachment.
 */

export interface WhatsAppShareRequest {
  kind: "invoice" | "quotation";
  /** "Invoice SWCO2026…" — shown in the header. */
  title: string;
  customerName: string;
  phone: string | null | undefined;
  fileName: string;
  /** The greeting; the link to the PDF is added after it. */
  message: string;
  makePdf: () => Promise<Blob>;
}

type Stage =
  | { state: "preparing" }
  | { state: "ready"; blob: Blob; link: string | null; uploadError: string | null }
  | { state: "failed"; error: string };

export function WhatsAppShareDialog({
  request,
  onClose,
}: {
  request: WhatsAppShareRequest | null;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ state: "preparing" });
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // WhatsApp is opened once, automatically. A second automatic launch on
  // re-render would stack "Open WhatsApp?" prompts.
  const launched = useRef(false);

  const phone = whatsappNumber(request?.phone);

  const text = (link: string | null) =>
    link
      ? `${request?.message ?? ""}\n\n${
          request?.kind === "invoice" ? "Invoice" : "Quotation"
        } (PDF): ${link}`
      : request?.message ?? "";

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    launched.current = false;
    setStage({ state: "preparing" });
    setCopied(false);
    setShareError(null);

    (async () => {
      let blob: Blob;
      try {
        blob = await request.makePdf();
      } catch (err) {
        if (!cancelled) {
          setStage({
            state: "failed",
            error: err instanceof Error ? err.message : "The PDF could not be made",
          });
        }
        return;
      }

      // A failed upload does not end the share: the message can still go
      // without a link, and the file can still be shared or downloaded.
      let link: string | null = null;
      let uploadError: string | null = null;
      try {
        link = await uploadForSharing(
          blob,
          request.fileName,
          request.kind === "invoice" ? "invoices" : "quotations"
        );
      } catch (err) {
        uploadError = err instanceof Error ? err.message : "Upload failed";
      }
      if (cancelled) return;

      setStage({ state: "ready", blob, link, uploadError });

      // Straight into the customer's chat. The browser may ask "Open
      // WhatsApp?" the first time; ticking "Always allow" stops that.
      if (link && !launched.current) {
        launched.current = true;
        window.location.href = appChatUrl(phone, text(link));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;

  const ready = stage.state === "ready" ? stage : null;
  const fullText = text(ready?.link ?? null);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const sendFile = async () => {
    if (!ready) return;
    setShareError(null);
    try {
      await shareFile(
        new File([ready.blob], request.fileName, { type: "application/pdf" }),
        request.message
      );
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Sharing is not available here");
    }
  };

  const buttonClass =
    "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-5 relative">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text/60 hover:bg-card/70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1 pr-8">
          <MessageCircle className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold truncate">{request.title}</h2>
        </div>
        <p className="text-sm text-text/70 mb-4">
          To {request.customerName || "customer"}
          {phone ? ` · +${phone}` : ""}
        </p>

        {!phone && (
          <p className="mb-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            No valid mobile number on this {request.kind}. WhatsApp will open
            without a chat selected.
          </p>
        )}

        {stage.state === "preparing" && (
          <div className="py-8 flex flex-col items-center gap-3 text-text/70">
            <Loader2 className="w-7 h-7 animate-spin text-green-600" />
            <p className="text-sm">Preparing the PDF and opening WhatsApp…</p>
          </div>
        )}

        {stage.state === "failed" && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {stage.error}
          </p>
        )}

        {ready && (
          <>
            {ready.link ? (
              <p className="mb-4 text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">
                WhatsApp should now be open on this chat with the message and
                the {request.kind} link — press <strong>Send</strong>. The link
                works for {LINK_LIFETIME_DAYS} days.
              </p>
            ) : (
              <p className="mb-4 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                {ready.uploadError}. You can still send the PDF file below.
              </p>
            )}

            <div className="rounded-lg bg-card/60 border border-card-border/10 px-3 py-2 mb-4 text-xs text-text/80 whitespace-pre-wrap break-all max-h-32 overflow-auto">
              {fullText}
            </div>

            <div className="space-y-2">
              <a
                href={appChatUrl(phone, fullText)}
                className={`${buttonClass} border-green-600/40 bg-green-600 text-white hover:bg-green-700`}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="flex-1">
                  {ready.link ? "Open WhatsApp again" : "Open WhatsApp (message only)"}
                </span>
              </a>
              <a
                href={webChatUrl(phone, fullText)}
                target="_blank"
                rel="noreferrer"
                className={`${buttonClass} border-card-border/20 hover:bg-card/70`}
              >
                <ExternalLink className="w-4 h-4 text-text/60" />
                <span className="flex-1">Use WhatsApp Web instead</span>
              </a>
              {canShareFiles() && (
                <button
                  onClick={sendFile}
                  className={`${buttonClass} border-card-border/20 hover:bg-card/70`}
                  title="Opens your device's share window with the PDF attached; choose WhatsApp, then the chat"
                >
                  <Share2 className="w-4 h-4 text-text/60" />
                  <span className="flex-1">Send the PDF file (choose the chat)</span>
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={copyMessage}
                  className={`${buttonClass} border-card-border/20 hover:bg-card/70`}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-text/60" />
                  )}
                  <span>{copied ? "Copied" : "Copy message"}</span>
                </button>
                <button
                  onClick={() => downloadFile(ready.blob, request.fileName)}
                  className={`${buttonClass} border-card-border/20 hover:bg-card/70`}
                >
                  <Download className="w-4 h-4 text-text/60" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            {shareError && (
              <p className="mt-3 text-xs text-red-600">{shareError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
