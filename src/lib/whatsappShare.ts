import { supabase } from "./supabase";

/**
 * Sending a document to a customer on WhatsApp.
 *
 * What a web page can and cannot do:
 *
 *   * It CAN open WhatsApp on a given number's chat with a message typed in
 *     (`whatsapp://send` for the installed app, `wa.me` for WhatsApp Web).
 *   * It CANNOT attach a file to that chat. No WhatsApp link carries a file.
 *   * The operating system's share sheet (`navigator.share`) CAN attach a
 *     file, but it cannot pick the chat -- the user chooses it.
 *
 * So the main path uploads the PDF and puts a link to it in the message: one
 * click opens the customer's own chat with everything in it, ready to send.
 * The share sheet is kept alongside for when the file itself should go.
 */

/** How long a shared invoice link keeps working. */
export const LINK_LIFETIME_DAYS = 60;

/** International format: digits only, India's 91 in front. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits.length >= 10 ? digits : null;
}

/** Opens the installed WhatsApp app on the chat. */
export function appChatUrl(phone: string | null, text: string): string {
  const params = new URLSearchParams({ text });
  if (phone) params.set("phone", phone);
  return `whatsapp://send?${params.toString()}`;
}

/** The same chat in WhatsApp Web, for a machine without the app. */
export function webChatUrl(phone: string | null, text: string): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Whether this browser can hand a PDF to the operating system's share sheet. */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare) return false;
    const probe = new File([""], "probe.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Stores the PDF and returns a link the customer can open without logging in.
 *
 * The bucket is private (the file carries their address and phone), so the
 * link is signed and expires. `download` names the file when it is saved,
 * rather than leaving the phone to call it by its storage key.
 */
export async function uploadForSharing(
  blob: Blob,
  fileName: string,
  folder: "invoices" | "quotations"
): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  const path = `${folder}/${id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    throw new Error(`The PDF could not be uploaded: ${uploadError.message}`);
  }

  const { data, error: linkError } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, LINK_LIFETIME_DAYS * 24 * 60 * 60, { download: fileName });
  if (linkError || !data?.signedUrl) {
    throw new Error(
      `The PDF was uploaded but no link could be made: ${linkError?.message ?? "unknown error"}`
    );
  }
  return data.signedUrl;
}

/** Attaches the actual PDF through the share sheet; the user picks the chat. */
export async function shareFile(file: File, text: string): Promise<"shared" | "cancelled"> {
  try {
    await navigator.share({ files: [file], title: file.name, text });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    throw err;
  }
}

/** Saves the PDF to Downloads. */
export function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
