import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserCheck } from "lucide-react";
import {
  CustomerMatch,
  LookupMode,
  isLookupReady,
  searchCustomers,
} from "../lib/customerLookup";

interface CustomerPhoneLookupProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the chosen customer; the form fills its other fields from it. */
  onSelect: (customer: CustomerMatch) => void;
  name?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /**
   * "phone" is the form's own phone field. "any" is a free search box --
   * name, place, pincode or number -- that is not itself a form field.
   */
  mode?: LookupMode;
}

/**
 * The phone field, for staff, with existing customers listed as it is typed.
 *
 * Most orders staff key in are for people who have bought before, and the
 * phone number is the one thing they are sure to have -- so it comes first,
 * and picking a match fills the rest of the form rather than retyping an
 * address that is already on file. Typing on without picking anything is a
 * new customer, exactly as before.
 */
export function CustomerPhoneLookup({
  value,
  onChange,
  onSelect,
  name = "phone",
  required,
  className = "",
  placeholder = "Type the customer's phone number",
  mode = "phone",
}: CustomerPhoneLookupProps) {
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // The number a match was just picked for: picking writes the phone back
  // into the field, which must not reopen the list it was picked from.
  const pickedFor = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLookupReady(value, mode) || pickedFor.current === value) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // A short pause so a number typed at speed is looked up once, not per key.
    const timer = setTimeout(async () => {
      const found = await searchCustomers(value, mode);
      if (cancelled) return;
      setMatches(found);
      setHighlight(0);
      setSearching(false);
      setOpen(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, mode]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (customer: CustomerMatch) => {
    // In phone mode the form writes the number back into this field; in
    // search mode the parent clears the box. Either way, no fresh lookup.
    pickedFor.current = mode === "phone" ? customer.phone : "";
    setOpen(false);
    setMatches([]);
    onSelect(customer);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      // Enter picks the highlighted customer instead of submitting the form.
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && matches.length > 0;
  const showNoMatch =
    open && !searching && matches.length === 0 &&
    isLookupReady(value, mode) &&
    pickedFor.current !== value;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type={mode === "phone" ? "tel" : "search"}
          name={mode === "phone" ? name : undefined}
          value={value}
          onChange={(e) => {
            pickedFor.current = null;
            onChange(e.target.value);
          }}
          onFocus={() => matches.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          required={required}
          autoComplete="off"
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          className={`${className} pr-10`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 pointer-events-none">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </span>
      </div>

      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-72 overflow-y-auto rounded-lg border border-card-border/20 bg-card shadow-xl py-1"
        >
          <li className="px-3 py-1 text-[11px] uppercase tracking-wide text-text/50">
            Existing customers — pick one to fill the form
          </li>
          {matches.map((m, i) => (
            <li key={m.key} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 ${
                  i === highlight ? "bg-primary-orange/10" : ""
                }`}
              >
                <UserCheck className="w-4 h-4 mt-0.5 text-primary-orange shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-sm">{m.name || "No name on file"}</span>
                    <span className="text-xs text-text/70 tabular-nums">{m.phone}</span>
                  </span>
                  <span className="block text-xs text-text/60 truncate">
                    {[m.address, m.city, m.state, m.pincode].filter(Boolean).join(", ") || "No address on file"}
                  </span>
                  <span className="block text-[11px] text-text/50">
                    {m.totalOrders > 0
                      ? `${m.totalOrders} previous ${m.totalOrders === 1 ? "order" : "orders"}`
                      : "Registered, no orders yet"}
                    {m.totalOrders > 0 && m.hasAccount ? " · has an account" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showNoMatch && (
        <p className="mt-1 text-xs text-text/60">
          {mode === "phone"
            ? "No existing customer with this number — fill in the details below as a new customer."
            : "No existing customer matches — fill in the details below as a new customer."}
        </p>
      )}
    </div>
  );
}
