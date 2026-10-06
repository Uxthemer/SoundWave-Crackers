import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  /** Shown when nothing is ticked, which means "no restriction". */
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  ariaLabel: string;
}

/**
 * A dropdown of checkboxes for the list filters.
 *
 * Every tick applies straight away -- there is no Apply button -- because the
 * filtering is done on rows already loaded, so there is nothing to wait for.
 * Nothing ticked means everything, the same as the old "Any …" option.
 */
export function MultiSelectFilter({
  placeholder,
  options,
  selected,
  onChange,
  ariaLabel,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? placeholder
      : `${placeholder.replace(/^(Any|All) /, "")}: ${selected.length}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-card border focus:outline-none focus:border-primary-orange ${
          selected.length > 0
            ? "border-primary-orange/60 text-primary-orange font-semibold"
            : "border-card-border/10"
        }`}
      >
        <span className="whitespace-nowrap">{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-1 z-30 min-w-[12rem] rounded-lg border border-card-border/10 bg-card shadow-lg py-1"
        >
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-primary-orange/10"
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                    checked
                      ? "bg-primary-orange border-primary-orange text-white"
                      : "border-card-border/40"
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <span className="whitespace-nowrap">{option.label}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 mt-1 border-t border-card-border/10 text-xs text-left text-text/60 hover:text-primary-orange"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
