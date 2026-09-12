import create from "zustand";
import { persist } from "zustand/middleware";

/**
 * Products saved for later.
 *
 * Kept in localStorage, not sessionStorage like the cart: the point of a
 * wishlist is that it is still there next visit, and it has to work for a
 * guest with no account. The price and stock shown on the wishlist page are
 * always read fresh from the catalog -- what is stored here is only enough to
 * show the row while the catalog loads, and how many the customer wants.
 */

export interface WishlistItem {
  id: string;
  name: string;
  image: string | null;
  offer_price: number;
  is_pack: boolean;
  /** How many to put in the cart when it is added from the wishlist. */
  quantity: number;
  added_at: string;
}

type WishlistSource = {
  id: string;
  name: string;
  image?: string | string[] | null;
  offer_price?: number | null;
  is_pack?: boolean;
};

interface WishlistStore {
  items: WishlistItem[];
  has: (id: string) => boolean;
  /** Adds the product, or removes it if it is already saved. Returns true when added. */
  toggle: (product: WishlistSource) => boolean;
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
}

const firstImage = (image: WishlistSource["image"]): string | null => {
  if (!image) return null;
  return Array.isArray(image) ? image[0] ?? null : image;
};

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],

      has: (id) => get().items.some((item) => item.id === id),

      toggle: (product) => {
        if (get().has(product.id)) {
          set((state) => ({
            items: state.items.filter((item) => item.id !== product.id),
          }));
          return false;
        }
        set((state) => ({
          // Newest first: the thing just saved is the thing being looked for.
          items: [
            {
              id: product.id,
              name: product.name,
              image: firstImage(product.image),
              offer_price: Number(product.offer_price ?? 0),
              is_pack: Boolean(product.is_pack),
              quantity: 1,
              added_at: new Date().toISOString(),
            },
            ...state.items,
          ],
        }));
        return true;
      },

      remove: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, quantity: Math.max(1, Math.floor(quantity) || 1) }
              : item
          ),
        })),

      clear: () => set({ items: [] }),
    }),
    {
      name: "swc-wishlist",
      // localStorage can be unavailable (private windows, blocked site data);
      // the wishlist then simply lasts for the visit instead of breaking.
      storage: {
        getItem: (name) => {
          try {
            const value = localStorage.getItem(name);
            return value ? JSON.parse(value) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            /* nothing to do */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* nothing to do */
          }
        },
      },
      partialize: (state) => ({ items: state.items } as unknown as WishlistStore),
    }
  )
);
