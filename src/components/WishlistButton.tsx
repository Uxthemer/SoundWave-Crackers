import { Heart } from "lucide-react";
import toast from "react-hot-toast";
import { useWishlistStore } from "../store/wishlistStore";

/**
 * The heart on a product: one tap saves it, another removes it.
 *
 * Stops the click from reaching whatever it sits on, because on a product
 * card that is usually a link to the product page.
 */
export function WishlistButton({
  product,
  variant = "overlay",
  className = "",
}: {
  product: {
    id: string;
    name: string;
    image?: string | string[] | null;
    offer_price?: number | null;
    is_pack?: boolean;
  };
  /** "overlay" floats on an image; "inline" sits in a row of buttons. */
  variant?: "overlay" | "inline";
  className?: string;
}) {
  // Subscribing to the flag itself re-renders only this heart when it changes.
  const saved = useWishlistStore((state) => state.items.some((item) => item.id === product.id));
  const toggle = useWishlistStore((state) => state.toggle);

  const label = saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const added = toggle(product);
        toast.success(added ? "Saved to wishlist" : "Removed from wishlist", {
          id: `wishlist-${product.id}`,
          duration: 1500,
        });
      }}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
      className={`${
        variant === "overlay"
          ? "p-1.5 rounded-full bg-white/90 dark:bg-black/60 shadow-sm backdrop-blur-sm hover:scale-110"
          : "p-2 rounded-lg bg-card hover:bg-card/70"
      } transition-transform ${className}`}
    >
      <Heart
        className={`w-5 h-5 transition-colors ${
          saved ? "fill-primary-red text-primary-red" : "text-text/60"
        }`}
      />
    </button>
  );
}
