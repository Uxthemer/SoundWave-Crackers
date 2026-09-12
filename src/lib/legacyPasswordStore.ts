/**
 * The `user_profiles.pwd` mirror.
 *
 * Phone sign-in works by verifying an OTP with Firebase and then signing the
 * customer into Supabase with their email and password — so it needs the
 * password back, in plain text. It is kept base64-encoded in
 * `user_profiles.pwd` for exactly that.
 *
 * ------------------------------------------------------------------------
 * Base64 is ENCODING, NOT ENCRYPTION. Anyone who can read that column can
 * read the passwords. It is readable to any code path that can select the
 * row, and it survives in database backups and exports.
 *
 * Keep it in step wherever the password changes — a stale mirror silently
 * breaks phone sign-in — and treat replacing it as worthwhile: Supabase's
 * own phone provider, or a server-side token exchange, would remove the need
 * to store a recoverable password at all.
 * ------------------------------------------------------------------------
 *
 * These helpers exist so encoding and decoding cannot drift apart. Plain
 * `btoa` throws on any character outside Latin-1 — an accented letter or an
 * emoji in a password is enough — so both directions go through UTF-8. For
 * the ASCII passwords already stored, this round-trips identically to
 * btoa/atob, so existing rows keep working untouched.
 */

/** Encodes a password for storage in `user_profiles.pwd`. */
export function encodeStoredPassword(password: string): string {
  const bytes = new TextEncoder().encode(password);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Reads a stored password back.
 *
 * Returns null when there is nothing usable there — an account created
 * before the mirror was written, or a corrupted value. Callers must treat
 * that as "cannot sign in this way" rather than letting an exception escape,
 * or attempt to sign in with an empty password.
 */
export function decodeStoredPassword(
  stored: string | null | undefined
): string | null {
  if (!stored || !stored.trim()) return null;
  try {
    const binary = atob(stored.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded || null;
  } catch {
    return null;
  }
}
