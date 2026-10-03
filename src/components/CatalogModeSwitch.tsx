import { Gift, LayoutGrid } from "lucide-react";

export type CatalogMode = "all" | "packs";

/** True when a product should be shown under the given mode. */
export const matchesCatalogMode = (
  product: { combo_pack_id?: string | null },
  mode: CatalogMode
) => mode === "all" || !!product.combo_pack_id;

/**
 * All products / Family packs, beside the title on Quick Purchase and
 * Explore Crackers.
 *
 * It only narrows what is listed. A family pack is already a product in the
 * catalogue (combo_pack_id set), so adding one to the cart, and everything
 * after that, is the same in either mode.
 */
export function CatalogModeSwitch({
  mode,
  onChange,
}: {
  mode: CatalogMode;
  onChange: (mode: CatalogMode) => void;
}) {
  const options: { value: CatalogMode; label: string; icon: JSX.Element }[] = [
    { value: "all", label: "All Products", icon: <LayoutGrid className="w-4 h-4" /> },
    { value: "packs", label: "Family Pack / Combo", icon: <Gift className="w-4 h-4" /> },
  ];

  return (
    <div
      role="group"
      aria-label="Show products"
      className="inline-flex items-center rounded-full bg-card border border-card-border/20 p-1 shadow-sm"
    >
      {options.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-montserrat font-bold whitespace-nowrap transition-colors ${
              active
                ? "bg-primary-orange text-white shadow"
                : "text-text/70 hover:text-primary-orange"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
