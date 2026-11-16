import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/** How far, after resistance, the page must be pulled to count. */
const THRESHOLD = 64;
const MAX_PULL = 96;
/** Movement before a touch is read as a pull rather than a tap or a sideways swipe. */
const SLOP = 8;

/**
 * Pull down at the top of the page to reload its data.
 *
 * Phones do not agree on this. Android Chrome has a native pull that reloads
 * the whole page -- every filter and open row lost -- and Safari on the
 * iPhone has none at all, nor does either once the site is installed as an
 * app (standalone PWAs get no browser gestures). So the gesture is done here,
 * on touch events, and calls `onRefresh` instead of reloading.
 *
 * Only a downward drag that starts with the page, and everything under the
 * finger, scrolled to the top counts: a drag inside a list that can still
 * scroll up, or a sideways swipe across a wide table, is left alone. Once a
 * pull is under way the touchmove is cancelled, which also keeps Chrome's own
 * pull-to-reload from firing on top of it.
 *
 * Mouse and trackpad never produce touch events, so desktop is unaffected.
 * Pass `enabled={false}` while a dialog is open -- the pull would otherwise
 * reload the list behind it.
 */
export function PullToRefresh({
  onRefresh,
  enabled = true,
}: {
  onRefresh: () => Promise<unknown> | void;
  enabled?: boolean;
}) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY: number | null = null;
    let pulling = false;
    let pulled = 0;

    const scrolledToTop = (target: EventTarget | null) => {
      if (window.scrollY > 0) return false;
      for (
        let el = target instanceof Element ? target : null;
        el && el !== document.body;
        el = el.parentElement
      ) {
        if (el.scrollTop > 0) return false;
      }
      return true;
    };

    const reset = () => {
      startY = null;
      pulling = false;
      pulled = 0;
    };

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (!scrolledToTop(event.target)) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      pulling = false;
    };

    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      const dx = event.touches[0].clientX - startX;
      if (!pulling) {
        if (dy > SLOP && dy > Math.abs(dx) * 1.5) {
          pulling = true;
        } else if (dy < 0 || Math.abs(dx) > SLOP) {
          reset();
          return;
        } else {
          return;
        }
      }
      // Half the finger's travel: the resistance is what makes it read as a pull.
      pulled = Math.min(MAX_PULL, Math.max(0, (dy - SLOP) * 0.5));
      setDistance(pulled);
      if (event.cancelable) event.preventDefault();
    };

    const onEnd = async () => {
      if (startY === null) return;
      const go = pulling && pulled >= THRESHOLD;
      reset();
      if (!go) {
        setDistance(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setDistance(THRESHOLD * 0.75);
      try {
        await onRefreshRef.current();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        setDistance(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: preventDefault is what stops the browser's own pull.
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      setDistance(0);
    };
  }, [enabled]);

  if (distance === 0 && !refreshing) return null;

  const ready = distance >= THRESHOLD;
  return (
    <div
      aria-live="polite"
      className="fixed left-1/2 top-16 z-40 pointer-events-none"
      style={{
        transform: `translate(-50%, ${distance - 24}px)`,
        transition: settleTransition(refreshing),
        opacity: Math.min(1, distance / (THRESHOLD * 0.6)),
      }}
    >
      <div
        className={`w-10 h-10 rounded-full shadow-lg border border-card-border/20 bg-background flex items-center justify-center ${
          ready || refreshing ? "text-primary-orange" : "text-text/60"
        }`}
      >
        <RefreshCw
          className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${distance * 3}deg)` }}
        />
      </div>
      <span className="sr-only">
        {refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
      </span>
    </div>
  );
}

/** Follows the finger exactly while pulling; eases only when it settles. */
function settleTransition(refreshing: boolean) {
  return refreshing ? "transform 150ms ease-out" : "none";
}
