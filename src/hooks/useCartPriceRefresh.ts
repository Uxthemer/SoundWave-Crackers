import { useEffect, useRef } from "react";
import { useSeasons } from "../context/SeasonContext";
import { useCartStore } from "../store/cartStore";
import { refreshCartPrices } from "../lib/cartPrices";

/** Opening and closing the cart repeatedly should not query each time. */
const MIN_GAP_MS = 60_000;

/**
 * Keeps a saved cart at the live season's prices: once when the app starts
 * (as soon as the live season is known) and again whenever the cart is
 * opened, at most once a minute. See lib/cartPrices for what it changes and
 * what it deliberately leaves alone.
 */
export function useCartPriceRefresh() {
  const { activeSeason } = useSeasons();
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const lastRun = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    const seasonId = activeSeason?.id;
    if (!seasonId || running.current) return;
    if (Date.now() - lastRun.current < MIN_GAP_MS) return;

    running.current = true;
    lastRun.current = Date.now();
    refreshCartPrices(seasonId)
      .catch((err) => console.warn("Cart price refresh failed:", err))
      .finally(() => {
        running.current = false;
      });
  }, [activeSeason?.id, isCartOpen]);
}
