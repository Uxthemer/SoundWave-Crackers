import { supabase } from "./supabase";

/**
 * The authorised signature: uploaded in Global Settings → Business & GST,
 * printed on the dummy GST invoice.
 *
 * It lives in the private `business-assets` bucket, readable only by admins
 * and superadmins (see 20261009000000_business_signature.sql), because
 * app_settings -- where its path is kept -- is readable by every visitor.
 * So it is never shown by a public URL: the settings page previews it
 * through a short-lived signed one, and the PDF reads the bytes directly.
 */

const BUCKET = "business-assets";

export interface SignatureImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Stores a new signature and returns its path. A fresh name every time, so
 *  nothing (browser, CDN) can hand back the old picture after a change. */
export async function uploadSignature(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `signature/${crypto.randomUUID()}.${ext || "png"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`The signature could not be uploaded: ${error.message}`);
  return path;
}

/** Best effort: a leftover file costs a few kilobytes, not a failed save. */
export async function removeSignature(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn("Could not remove the old signature:", error);
}

/** A link good for an hour, for the preview on the settings page. */
export async function signatureUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("Could not sign the signature preview:", error);
    return null;
  }
  return data.signedUrl;
}

/** The image ready for jsPDF, or null if there is none or it cannot be read. */
export async function loadSignature(path: string | null | undefined): Promise<SignatureImage | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.warn("Could not load the signature:", error);
    return null;
  }

  // Redrawn as PNG on a canvas: jsPDF takes PNG and JPEG but not WebP, and
  // this also gives the pixel size needed to keep the proportions.
  const objectUrl = URL.createObjectURL(data);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The signature image could not be read"));
      image.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight };
  } catch (err) {
    console.warn(err);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
