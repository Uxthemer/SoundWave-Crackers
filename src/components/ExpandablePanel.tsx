import { ReactNode, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface ExpandablePanelProps {
  title: string;
  /**
   * Rendered once, in place or full screen. A render function rather than
   * plain children so the table can drop its fixed inner height when it has
   * the whole screen -- and because it is the same element moving, not a
   * copy, a search typed in the small panel is still there when it opens.
   */
  children: (expanded: boolean) => ReactNode;
  className?: string;
}

/**
 * A card with a full-screen toggle, for the tables beside the charts.
 * ExpandableChart does this for a chart by cloning it into a modal; a table
 * with its own search and sort state cannot be cloned without losing that
 * state, so here the card itself goes full screen.
 */
export function ExpandablePanel({ title, children, className = "" }: ExpandablePanelProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", escape);
    document.body.classList.add("overflow-hidden");
    return () => {
      document.removeEventListener("keydown", escape);
      document.body.classList.remove("overflow-hidden");
    };
  }, [expanded]);

  const card = (
    <div
      className={
        expanded
          ? "bg-card w-full h-full max-w-7xl rounded-2xl shadow-2xl p-4 sm:p-6 flex flex-col border border-card-border/20"
          : `bg-card rounded-xl p-6 flex flex-col ${className}`
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className={`font-montserrat font-bold ${expanded ? "text-2xl" : "text-xl"}`}>
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-text/60 hover:text-primary-orange"
          title={expanded ? "Exit full screen" : "Full screen"}
          aria-label={expanded ? `Exit full screen: ${title}` : `Full screen: ${title}`}
        >
          {expanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>
      {children(expanded)}
    </div>
  );

  if (!expanded) return card;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-8"
      onClick={() => setExpanded(false)}
    >
      {card}
    </div>
  );
}
