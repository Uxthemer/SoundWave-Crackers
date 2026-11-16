import { useEffect } from "react";
import { X } from "lucide-react";
import { youtubeEmbedUrl, youtubeVideoId } from "../lib/youtube";

/**
 * A product's video, over the page. Shared by Explore, Quick Purchase and the
 * product page, which each had their own copy of this popup -- all embedding
 * the raw field, so a pasted link played nowhere.
 *
 * Sized by aspect ratio rather than a fixed height: 16:9 for a normal video,
 * and narrower and taller on a phone, where most of these are Shorts.
 */
export function YouTubeVideoModal({
  link,
  title,
  onClose,
}: {
  link: string | null | undefined;
  title?: string;
  onClose: () => void;
}) {
  const id = youtubeVideoId(link);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!id) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Video: ${title}` : "Product video"}
    >
      <div
        className="relative w-full max-w-[min(90vw,420px)] sm:max-w-3xl aspect-[9/16] sm:aspect-video max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-11 right-0 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Close video"
        >
          <X className="w-6 h-6" />
        </button>
        <iframe
          className="w-full h-full rounded-lg bg-black"
          src={youtubeEmbedUrl(id)}
          title={title || "Product video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
