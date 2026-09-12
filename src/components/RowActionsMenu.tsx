import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";

/**
 * The ⋮ menu at the end of a table row.
 *
 * The menu is positioned `fixed`, from the button's place on screen, rather
 * than absolutely inside the cell: the tables it sits in scroll sideways
 * (`overflow-x-auto`), and an absolute menu inside one is clipped at the
 * table's edge — on the last rows it would open into nothing. Fixed escapes
 * that, and it flips upward when there is no room below.
 *
 * Because a fixed menu would drift away from its row the moment anything
 * scrolls, it simply closes on scroll or resize, as native menus do.
 */

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Leaves the item out entirely, e.g. for a role that cannot use it. */
  hidden?: boolean;
  disabled?: boolean;
  title?: string;
}

const MENU_WIDTH = 192; // w-48
const GAP = 4;

export function RowActionsMenu({
  actions,
  label = "More actions",
}: {
  actions: RowAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visible = actions.filter((action) => !action.hidden);

  // Placed after the menu has rendered, so its real height decides whether
  // it opens below the button or above it.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const height = menuRef.current.offsetHeight;

    const fitsBelow = button.bottom + GAP + height <= window.innerHeight;
    const top = fitsBelow ? button.bottom + GAP : Math.max(GAP, button.top - GAP - height);
    // Right edges aligned, kept on screen at both sides.
    const left = Math.min(
      Math.max(GAP, button.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - GAP
    );
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Capture, so scrolling the table itself (not just the page) closes it.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          setPosition(null);
          setOpen((on) => !on);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`p-1 sm:p-2 rounded-lg transition-colors ${
          open ? "bg-card text-primary-orange" : "text-text/70 hover:bg-card/70"
        }`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            width: MENU_WIDTH,
            // Hidden for the one frame before it is measured, so it never
            // flashes in the wrong place.
            visibility: position ? "visible" : "hidden",
          }}
          className="z-50 rounded-xl border border-card-border/20 bg-background shadow-xl py-1.5"
        >
          {visible.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              disabled={action.disabled}
              title={action.title}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-card/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <span className="text-primary-orange shrink-0">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
