/**
 * A product's YouTube video, from whatever was typed into Stock Management.
 *
 * The field is labelled "YouTube Video ID", but what gets pasted is whatever
 * the browser's address bar or the Share button gave: a watch URL, a youtu.be
 * link, a Shorts link. The players embedded `youtube.com/embed/<the field>`,
 * so a full URL produced a broken player -- and an empty string (most rows
 * hold "" rather than null) still counted as "has a video" in some checks.
 *
 * Everything that shows a video icon or plays one goes through here, so a link
 * either works everywhere or shows nowhere.
 */

/** YouTube ids are 11 characters of letters, digits, - and _. */
const ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(link: string | null | undefined): string | null {
  const text = String(link ?? "").trim();
  if (!text) return null;
  if (ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let candidate: string | null | undefined;
  if (host === "youtu.be") {
    candidate = parts[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    candidate =
      url.searchParams.get("v") ??
      // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
      (["shorts", "embed", "live", "v"].includes(parts[0]) ? parts[1] : undefined);
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

export const youtubeEmbedUrl = (id: string) =>
  `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
