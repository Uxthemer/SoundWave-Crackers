import { useEffect, useMemo, useState } from "react";
import { Loader2, ShoppingCart, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { loadCatalogue } from "../lib/priceListSerials";
import { NumberInput } from "./NumberInput";
import { CustomerPhoneLookup } from "./CustomerPhoneLookup";
import type { CustomerMatch } from "../lib/customerLookup";
import { cleanDelivery, deliveryProblem } from "../lib/deliveryDetails";

/**
 * Edit a quotation in place: the customer's details and the quoted lines.
 *
 * Editing used to mean loading the quotation into the cart, which replaced
 * whatever was in the cart and sent staff through the checkout screens to
 * change one quantity. This is the same job in a popup, laid out like the
 * order editor so the two feel alike.
 *
 * Saving goes through the caller's `onSave` -- useQuotations' saveQuotation,
 * the very function the cart saves with -- so a quotation edited here is
 * stored exactly as one edited in the cart would be.
 *
 * Prices: a line already on the quotation keeps its quoted price, because a
 * quote is a promise about price. A line added here is priced from the
 * quotation's season as it stands today.
 */

type Line = {
  /** Stable key for React; lines have no id until saved. */
  key: string;
  product_id: string | null;
  combo_pack_id: string | null;
  name: string;
  product_code?: string | null;
  quantity: number;
  price: number;
};

type CatalogueOption = {
  id: string;
  name: string;
  product_code: string | null;
  offer_price: number;
  stock: number;
  /** S.No on the price list. */
  serial: number;
  category: string;
};

export type QuotationDetails = {
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  total_amount: number;
};

export type QuotationLineInput = {
  product_id: string | null;
  combo_pack_id: string | null;
  quantity: number;
  price: number;
  total_price: number;
};

type Props = {
  quote: any;
  /** The season to offer products from when the quotation has none recorded. */
  fallbackSeasonId: string | null;
  onClose: () => void;
  onSave: (details: QuotationDetails, lines: QuotationLineInput[]) => Promise<void>;
  /** The old route, kept for anyone who wants the cart's tools (share, etc.). */
  onOpenInCart: () => void;
};

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function EditQuotationModal({
  quote,
  fallbackSeasonId,
  onClose,
  onSave,
  onOpenInCart,
}: Props) {
  const [details, setDetails] = useState(() => ({
    customer_name: quote.customer_name || "",
    email: quote.email || "",
    phone: quote.phone || "",
    address: quote.address || "",
    city: quote.city || "",
    state: quote.state || "",
    pincode: quote.pincode || "",
  }));
  const [lines, setLines] = useState<Line[]>(() =>
    (quote.items || []).map((item: any) => ({
      key: nextKey(),
      product_id: item.product_id ?? null,
      combo_pack_id: item.combo_pack_id ?? null,
      name:
        item.product?.name ??
        item.pack?.name ??
        (item.combo_pack_id ? "Family pack" : "Product"),
      product_code: item.product?.product_code ?? item.pack?.pack_code ?? null,
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
    }))
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogueOption[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [addingId, setAddingId] = useState("");
  const [addingQty, setAddingQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const seasonId: string | null = quote.season_id ?? fallbackSeasonId;

  useEffect(() => {
    if (!seasonId) return;
    let cancelled = false;
    setCatalogueLoading(true);
    // In price-list order -- categories by their order, products by theirs
    // within each -- and numbered with the price list's S.No. Sorting on the
    // product's own `order` alone interleaves the categories, because that
    // number only means something inside its category. loadCatalogue is the
    // walk the price list and the order-sheet scanner share, so the three
    // cannot disagree.
    loadCatalogue(seasonId)
      .then((loaded) => {
        if (cancelled) return;
        setCatalogue(
          loaded.entries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            product_code: entry.productCode,
            offer_price: entry.offerPrice ?? 0,
            stock: Number(entry.raw?.stock ?? 0),
            serial: entry.serial,
            category: entry.category,
          }))
        );
      })
      .catch((catalogueError) => {
        if (cancelled) return;
        console.error("Failed to load products for the quotation:", catalogueError);
        toast.error("Could not load the product list.");
        setCatalogue([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogueLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  const visibleOptions = useMemo(() => {
    const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return catalogue;
    return catalogue.filter((option) => {
      const haystack = `${option.name} ${option.product_code ?? ""} ${option.category}`.toLowerCase();
      // A bare number is also tried as the S.No the customer copied from the
      // price list.
      return words.every(
        (word) => haystack.includes(word) || String(option.serial) === word
      );
    });
  }, [catalogue, filter]);

  /**
   * The quoted lines in catalogue order -- the order the price list and the
   * shop show -- so the quote reads the way the customer's list does, and a
   * product added here drops into its place instead of onto the end.
   *
   * The catalogue is already fetched ordered by `order`, then name, so a
   * line's position in it is its rank. Only the display is sorted; the lines
   * themselves stay as they are. A line the season no longer lists (an old
   * pack line, a withdrawn product) has no rank and goes last, by name.
   */
  const sortedLines = useMemo(() => {
    const rank = new Map(catalogue.map((option, index) => [option.id, index]));
    const rankOf = (line: Line) =>
      line.product_id && rank.has(line.product_id)
        ? (rank.get(line.product_id) as number)
        : Number.MAX_SAFE_INTEGER;
    return [...lines].sort(
      (a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name)
    );
  }, [lines, catalogue]);

  // Consecutive runs of one category; the catalogue arrives grouped already.
  const optionGroups = useMemo(() => {
    const groups: { category: string; options: CatalogueOption[] }[] = [];
    visibleOptions.forEach((option) => {
      const last = groups[groups.length - 1];
      if (last && last.category === option.category) last.options.push(option);
      else groups.push({ category: option.category, options: [option] });
    });
    return groups;
  }, [visibleOptions]);

  const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const fillFromCustomer = (customer: CustomerMatch) => {
    setDetails((d) => ({
      ...d,
      customer_name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
    }));
    setCustomerSearch("");
  };

  const setQuantity = (key: string, quantity: number) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, quantity } : line))
    );

  const removeLine = (key: string) =>
    setLines((current) => current.filter((line) => line.key !== key));

  const addProduct = () => {
    const option = catalogue.find((o) => o.id === addingId);
    if (!option) return;
    const quantity = Math.max(1, addingQty);
    setLines((current) => {
      // Already quoted: add to that line rather than quoting it twice.
      const existing = current.find((line) => line.product_id === option.id);
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      return [
        ...current,
        {
          key: nextKey(),
          product_id: option.id,
          combo_pack_id: null,
          name: option.name,
          product_code: option.product_code,
          quantity,
          price: Number(option.offer_price) || 0,
        },
      ];
    });
    setAddingId("");
    setAddingQty(1);
    setFilter("");
  };

  const handleSave = async () => {
    setError("");
    // The cart's cleaning and the cart's quotation rule, so a quotation
    // edited here is stored as one saved from the cart would be.
    const clean = cleanDelivery({
      customerName: details.customer_name,
      email: details.email,
      phone: details.phone,
      alternatePhone: "",
      referralPhone: "",
      address: details.address,
      city: details.city,
      state: details.state,
      district: "",
      pincode: details.pincode,
      country: "India",
    });
    const problem = deliveryProblem(clean, "quotation");
    if (problem) {
      setError(problem);
      return;
    }
    const cleaned = {
      customer_name: clean.customerName,
      email: clean.email,
      phone: clean.phone,
      address: clean.address,
      city: clean.city,
      state: clean.state,
      pincode: clean.pincode,
    };
    setDetails(cleaned);
    if (lines.length === 0) {
      setError("A quotation needs at least one product.");
      return;
    }
    if (lines.some((line) => line.quantity < 1)) {
      setError("Every quantity must be at least 1.");
      return;
    }
    setSaving(true);
    try {
      await onSave(
        { ...cleaned, total_amount: total },
        lines.map((line) => ({
          product_id: line.combo_pack_id ? null : line.product_id,
          combo_pack_id: line.combo_pack_id,
          quantity: line.quantity,
          price: line.price,
          total_price: line.quantity * line.price,
        }))
      );
      onClose();
    } catch (e) {
      // saveQuotation has already shown a toast; keep the popup open so
      // nothing typed is lost.
      setError(e instanceof Error ? e.message : "Could not save the quotation.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-orange";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            Edit Quotation: {quote.short_id}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          <section className="space-y-3">
            <h4 className="font-semibold text-gray-900">Customer & Address</h4>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Find existing customer{" "}
                <span className="font-normal text-gray-500">
                  — by name, phone, city, district, address or pincode
                </span>
              </label>
              <CustomerPhoneLookup
                mode="any"
                value={customerSearch}
                onChange={setCustomerSearch}
                onSelect={fillFromCustomer}
                placeholder="e.g. Ravi Chennai, 600042, 97897…"
                className={input}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={details.customer_name}
                onChange={(e) => setDetails({ ...details, customer_name: e.target.value })}
                className={input}
                placeholder="Customer name *"
              />
              <input
                value={details.phone}
                onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                className={input}
                placeholder="Phone *"
                inputMode="tel"
              />
              <input
                value={details.email}
                onChange={(e) => setDetails({ ...details, email: e.target.value })}
                className={`${input} md:col-span-2`}
                placeholder="Email"
              />
              <input
                value={details.address}
                onChange={(e) => setDetails({ ...details, address: e.target.value })}
                className={`${input} md:col-span-2`}
                placeholder="Address"
              />
              <input
                value={details.city}
                onChange={(e) => setDetails({ ...details, city: e.target.value })}
                className={input}
                placeholder="City"
              />
              <input
                value={details.state}
                onChange={(e) => setDetails({ ...details, state: e.target.value })}
                className={input}
                placeholder="State"
              />
              <input
                value={details.pincode}
                onChange={(e) => setDetails({ ...details, pincode: e.target.value })}
                className={input}
                placeholder="PIN"
                inputMode="numeric"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="font-semibold text-gray-900">Products</h4>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-2 text-left w-10">#</th>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-center w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedLines.map((line, index) => (
                    <tr key={line.key}>
                      <td className="p-2 text-gray-400">{index + 1}</td>
                      <td className="p-2 text-gray-900">
                        {line.name}
                        {line.product_code && (
                          <span className="ml-1 text-xs text-gray-400">({line.product_code})</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <NumberInput
                          min={1}
                          value={line.quantity}
                          onValueChange={(n) => setQuantity(line.key, Math.max(1, n))}
                          className="w-20 p-1 border border-gray-300 rounded text-center"
                        />
                      </td>
                      <td className="p-2 text-right">₹{line.price.toFixed(2)}</td>
                      <td className="p-2 text-right font-medium">
                        ₹{(line.quantity * line.price).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeLine(line.key)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50"
                          title={`Remove ${line.name}`}
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
                        No products — add one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add a product. The search narrows the list, which runs to
                several hundred products in season. */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_7rem_auto] gap-2 items-center">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={input}
                placeholder="Search name, code or S.No"
              />
              <select
                value={addingId}
                onChange={(e) => setAddingId(e.target.value)}
                className={input}
                disabled={catalogueLoading || !seasonId}
              >
                <option value="">
                  {!seasonId
                    ? "No season to pick products from"
                    : catalogueLoading
                      ? "Loading products…"
                      : `Select product to add (${visibleOptions.length})`}
                </option>
                {/* Under the price list's category headings, each product
                    with its S.No, so it reads like the sheet in the
                    customer's hand. */}
                {optionGroups.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.serial}. {option.name}
                        {option.product_code ? ` (${option.product_code})` : ""} — ₹
                        {Number(option.offer_price).toFixed(2)} · Stock {option.stock}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <NumberInput
                min={1}
                value={addingQty}
                onValueChange={(n) => setAddingQty(Math.max(1, n))}
                className={input}
                placeholder="Qty"
              />
              <button
                onClick={addProduct}
                disabled={!addingId}
                className="px-4 py-2 rounded-lg bg-primary-orange text-white font-medium disabled:opacity-40"
              >
                Add
              </button>
            </div>

            <div className="text-right text-gray-900">
              <span className="text-sm text-gray-500 mr-3">
                {lines.length} products · {totalQuantity} qty
              </span>
              <span className="font-bold text-lg text-primary-orange">
                Total: ₹{total.toFixed(2)}
              </span>
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-gray-100">
          <button
            onClick={onOpenInCart}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            title="Discard changes here and edit this quotation in the cart instead"
          >
            <ShoppingCart className="w-4 h-4" />
            Open in cart instead
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white font-medium disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
