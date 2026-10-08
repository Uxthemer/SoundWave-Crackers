import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileDown, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useAppSettings } from "../context/AppSettingsContext";
import { useSeasons } from "../context/SeasonContext";
import { businessFromSettings } from "../lib/businessDetails";
import { gstTotals, type GstInvoiceLine } from "../lib/gstInvoice";
import { loadSignature } from "../lib/businessSignature";

/**
 * "Generate dummy invoice" (user menu, admin and superadmin): a GST tax
 * invoice typed up from scratch -- products picked from the active season or
 * written in, prices free to change, any billing and shipping address -- and
 * downloaded as a PDF.
 *
 * Nothing is saved. No order is created, no stock moves, no number is drawn
 * from the order sequence; closing the form forgets it.
 */

/** Fireworks. Pre-filled on every line; any line can carry another. */
const DEFAULT_HSN = "3604";
const GST_RATES = [0, 5, 12, 18, 28];

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

interface CatalogProduct {
  id: string;
  name: string;
  product_code: string | null;
  content: string | null;
  offer_price: number;
}

interface Line extends GstInvoiceLine {
  key: string;
}

interface Party {
  name: string;
  phone: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY_PARTY: Party = {
  name: "",
  phone: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};

const sameState = (a: string, b: string) =>
  a.trim().toLowerCase() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

let lineCounter = 0;
const newKey = () => `line-${++lineCounter}`;

export function DummyInvoiceModal({ onClose }: { onClose: () => void }) {
  const { settings } = useAppSettings();
  const { activeSeason } = useSeasons();
  const business = useMemo(() => businessFromSettings(settings), [settings]);

  const now = new Date();
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${format(now, "yyMMdd-HHmm")}`);
  const [invoiceDate, setInvoiceDate] = useState(format(now, "yyyy-MM-dd"));
  const [sellerGstin, setSellerGstin] = useState(business.gstin ?? "");
  const [gstRate, setGstRate] = useState(18);
  const [pricesIncludeGst, setPricesIncludeGst] = useState(true);

  const [billTo, setBillTo] = useState<Party>({ ...EMPTY_PARTY, state: business.state ?? "" });
  const [shipSame, setShipSame] = useState(true);
  const [shipTo, setShipTo] = useState<Party>(EMPTY_PARTY);
  const [transportName, setTransportName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const signaturePath = settings?.signature_path ?? null;
  const [withSignature, setWithSignature] = useState(true);

  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");

  // Null until the user picks one; until then it follows the states typed in.
  const [interStateChoice, setInterStateChoice] = useState<boolean | null>(null);

  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);

  // Settings may arrive after the form opens.
  useEffect(() => {
    if (business.gstin) setSellerGstin((current) => current || business.gstin || "");
  }, [business.gstin]);

  useEffect(() => {
    if (!activeSeason?.id) return;
    let cancelled = false;
    setCatalogLoading(true);
    supabase
      .from("season_catalog")
      .select("id, name, product_code, content, offer_price")
      .eq("season_id", activeSeason.id)
      .eq("is_active", true)
      .order("order", { nullsFirst: false })
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Could not load products for the invoice:", error);
          toast.error("Could not load the product list. You can still type items in.");
        }
        setCatalog(((data ?? []) as CatalogProduct[]).map((p) => ({
          ...p,
          offer_price: Number(p.offer_price || 0),
        })));
        setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeason?.id]);

  // Esc closes, as every other popup here does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const placeOfSupply = shipSame ? billTo.state : shipTo.state;
  const autoInterState = placeOfSupply.trim() !== "" && !!business.state && !sameState(placeOfSupply, business.state);
  const interState = interStateChoice ?? autoInterState;

  const matches = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return catalog
      .filter((p) => {
        const hay = `${p.name} ${p.product_code ?? ""} ${p.content ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [catalog, search]);

  const totals = gstTotals({
    lines,
    gstRate,
    pricesIncludeGst,
    discount: Number(discount) || 0,
    shipping: Number(shipping) || 0,
    interState,
  });

  const addProduct = (p: CatalogProduct) => {
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        name: p.content ? `${p.name} (${p.content})` : p.name,
        hsn: DEFAULT_HSN,
        quantity: 1,
        rate: p.offer_price,
      },
    ]);
    setSearch("");
  };

  const addCustom = () =>
    setLines((prev) => [
      ...prev,
      { key: newKey(), name: "", hsn: DEFAULT_HSN, quantity: 1, rate: 0 },
    ]);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const clean = (p: Party) => ({
    name: p.name.trim(),
    phone: p.phone.trim(),
    gstin: p.gstin.trim().toUpperCase(),
    address: p.address.trim(),
    city: p.city.trim(),
    state: p.state.trim(),
    pincode: p.pincode.trim(),
  });

  const generate = async () => {
    const usable = lines.filter((l) => l.name.trim() && l.quantity > 0 && l.rate > 0);
    if (!invoiceNumber.trim()) return toast.error("Enter an invoice number");
    if (!sellerGstin.trim()) return toast.error("Enter your GSTIN — a tax invoice must carry it");
    if (!billTo.name.trim()) return toast.error("Enter the customer's name");
    if (!usable.length) return toast.error("Add at least one product with a quantity and a price");
    if (usable.length < lines.length) {
      return toast.error("Every line needs a name, a quantity and a price — fill it in or remove it");
    }
    if (!shipSame && !shipTo.name.trim()) return toast.error("Enter who the goods are shipped to");

    setGenerating(true);
    try {
      // Loaded on demand, like the price list: jsPDF is a third of a megabyte.
      const { buildGstInvoicePdf } = await import("../lib/gstInvoicePdf");
      const signature =
        withSignature && signaturePath ? await loadSignature(signaturePath) : null;
      if (withSignature && signaturePath && !signature) {
        toast.error("The signature could not be loaded, so the invoice is unsigned");
      }
      const pdf = await buildGstInvoicePdf({
        signature,
        number: invoiceNumber.trim(),
        date: new Date(`${invoiceDate}T00:00:00`),
        business,
        sellerGstin: sellerGstin.trim().toUpperCase(),
        billTo: clean(billTo),
        shipTo: shipSame ? null : clean(shipTo),
        transport: {
          name: transportName.trim(),
          vehicle: vehicle.trim().toUpperCase(),
          lrNumber: lrNumber.trim(),
        },
        lines: usable.map(({ name, hsn, quantity, rate }) => ({
          name: name.trim(),
          hsn: hsn.trim(),
          quantity,
          rate,
        })),
        gstRate,
        pricesIncludeGst,
        discount: Number(discount) || 0,
        shipping: Number(shipping) || 0,
        interState,
        paymentTerms: paymentTerms.trim(),
      });
      pdf.save(`Tax_Invoice_${invoiceNumber.trim().replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`);
      toast.success("Invoice downloaded");
    } catch (err) {
      console.error("Could not build the invoice:", err);
      toast.error("Could not create the invoice PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg border border-card-border/20 bg-background text-sm focus:outline-none focus:border-primary-orange";
  const label = "block text-xs font-medium text-text/70 mb-1";
  const section = "text-sm font-semibold text-primary-orange mb-2";

  const partyFields = (party: Party, set: (p: Party) => void, idPrefix: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={label} htmlFor={`${idPrefix}-name`}>Name *</label>
        <input id={`${idPrefix}-name`} className={input} value={party.name}
          onChange={(e) => set({ ...party, name: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-phone`}>Phone</label>
        <input id={`${idPrefix}-phone`} type="tel" className={input} value={party.phone}
          onChange={(e) => set({ ...party, phone: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${idPrefix}-address`}>Address</label>
        <textarea id={`${idPrefix}-address`} rows={2} className={input} value={party.address}
          onChange={(e) => set({ ...party, address: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-city`}>City</label>
        <input id={`${idPrefix}-city`} className={input} value={party.city}
          onChange={(e) => set({ ...party, city: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-state`}>State</label>
        <input id={`${idPrefix}-state`} list="dummy-invoice-states" className={input} value={party.state}
          onChange={(e) => set({ ...party, state: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-pincode`}>Pincode</label>
        <input id={`${idPrefix}-pincode`} inputMode="numeric" className={input} value={party.pincode}
          onChange={(e) => set({ ...party, pincode: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-gstin`}>GSTIN (if registered)</label>
        <input id={`${idPrefix}-gstin`} className={`${input} uppercase`} value={party.gstin}
          onChange={(e) => set({ ...party, gstin: e.target.value.toUpperCase() })} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-card-border/10">
          <div>
            <h2 className="text-lg font-bold">Generate dummy invoice</h2>
            <p className="text-xs text-text/60">
              A GST tax invoice as a PDF. Nothing is saved — no order, no stock change.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text/60 hover:bg-card/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <datalist id="dummy-invoice-states">
          {STATES.map((s) => <option key={s} value={s} />)}
        </datalist>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Invoice and GST */}
          <section>
            <h3 className={section}>Invoice & GST</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={label} htmlFor="inv-number">Invoice No *</label>
                <input id="inv-number" className={input} value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-date">Date</label>
                <input id="inv-date" type="date" className={input} value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-gstin">Your GSTIN *</label>
                <input id="inv-gstin" className={`${input} uppercase`} value={sellerGstin}
                  onChange={(e) => setSellerGstin(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className={label} htmlFor="inv-rate">GST rate</label>
                <select id="inv-rate" className={input} value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}>
                  {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pricesIncludeGst}
                  onChange={(e) => setPricesIncludeGst(e.target.checked)} />
                Prices entered include GST
              </label>
              {signaturePath ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={withSignature}
                    onChange={(e) => setWithSignature(e.target.checked)} />
                  Add authorised signature
                </label>
              ) : (
                <span className="text-xs text-text/50 self-center">
                  No signature yet — a superadmin can upload one in Global Settings → Business &amp; GST.
                </span>
              )}
              <label className="flex items-center gap-2">
                <span className="text-text/70">Supply:</span>
                <select className="px-2 py-1 rounded border border-card-border/20 bg-background text-sm"
                  value={interState ? "inter" : "intra"}
                  onChange={(e) => setInterStateChoice(e.target.value === "inter")}>
                  <option value="intra">Within state (CGST + SGST)</option>
                  <option value="inter">Other state (IGST)</option>
                </select>
              </label>
            </div>
            {!business.state && (
              <p className="mt-2 text-xs text-amber-700">
                Your business state is not set in Global Settings, so pick the supply type yourself.
              </p>
            )}
          </section>

          {/* Products */}
          <section>
            <h3 className={section}>Products</h3>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text/40" />
              <input
                className={`${input} pl-9`}
                placeholder={catalogLoading ? "Loading products…" : "Search products to add (name or code)"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-card rounded-lg shadow-lg border border-card-border/10 max-h-64 overflow-y-auto">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-card/70"
                      >
                        <span className="truncate">
                          {p.name}
                          {p.content && <span className="text-text/50"> · {p.content}</span>}
                          {p.product_code && <span className="text-text/40"> · {p.product_code}</span>}
                        </span>
                        <span className="shrink-0 text-text/70">{money(p.offer_price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_80px_70px_100px_100px_32px] gap-2 text-xs text-text/60 px-1">
                  <span>Product</span><span>HSN</span><span>Qty</span>
                  <span>Rate {pricesIncludeGst ? "(incl. GST)" : "(excl. GST)"}</span>
                  <span className="text-right">Taxable</span><span />
                </div>
                {lines.map((line, index) => (
                  <div key={line.key}
                    className="grid grid-cols-[1fr_32px] sm:grid-cols-[1fr_80px_70px_100px_100px_32px] gap-2 items-center p-2 sm:p-1 rounded-lg bg-card/40 sm:bg-transparent">
                    <input className={input} placeholder="Item name" aria-label="Item name" value={line.name}
                      onChange={(e) => updateLine(line.key, { name: e.target.value })} />
                    <button type="button" onClick={() => removeLine(line.key)} aria-label="Remove line"
                      className="sm:order-last p-1.5 rounded-lg text-primary-red hover:bg-card/70 justify-self-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="col-span-2 sm:col-span-1 sm:contents grid grid-cols-3 gap-2">
                      <input className={input} aria-label="HSN" value={line.hsn}
                        onChange={(e) => updateLine(line.key, { hsn: e.target.value })} />
                      <input className={input} type="number" min={0} aria-label="Quantity" value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: Math.max(0, Number(e.target.value)) })} />
                      <input className={input} type="number" min={0} step="0.01" aria-label="Rate" value={line.rate}
                        onChange={(e) => updateLine(line.key, { rate: Math.max(0, Number(e.target.value)) })} />
                    </div>
                    <span className="hidden sm:block text-right text-sm tabular-nums">
                      {money(totals.lines[index]?.taxable ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addCustom}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary-orange hover:underline">
              <Plus className="w-4 h-4" /> Add an item not in the list
            </button>
          </section>

          {/* Customer */}
          <section>
            <h3 className={section}>Bill to</h3>
            {partyFields(billTo, setBillTo, "bill")}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`${section} mb-0`}>Ship to</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={shipSame} onChange={(e) => setShipSame(e.target.checked)} />
                Same as billing
              </label>
            </div>
            {!shipSame && partyFields(shipTo, setShipTo, "ship")}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className={label} htmlFor="inv-transport">Transport</label>
                <input id="inv-transport" className={input} value={transportName}
                  onChange={(e) => setTransportName(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-vehicle">Vehicle No</label>
                <input id="inv-vehicle" className={`${input} uppercase`} value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-lr">LR No</label>
                <input id="inv-lr" className={input} value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Charges */}
          <section>
            <h3 className={section}>Charges</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={label} htmlFor="inv-discount">Discount (₹)</label>
                <input id="inv-discount" type="number" min={0} step="0.01" className={input} value={discount}
                  onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-shipping">Packing & forwarding (₹)</label>
                <input id="inv-shipping" type="number" min={0} step="0.01" className={input} value={shipping}
                  onChange={(e) => setShipping(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="inv-terms">Payment</label>
                <input id="inv-terms" className={input} placeholder="e.g. Cash, UPI, Credit 15 days"
                  value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </div>
            </div>
            {pricesIncludeGst && (
              <p className="mt-2 text-xs text-text/60">
                Discount and charges are taken as including GST, like the prices.
              </p>
            )}
          </section>
        </div>

        {/* Running totals and the button */}
        <div className="border-t border-card-border/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="text-xs sm:text-sm text-text/70 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            <span>Taxable {money(totals.taxable)}</span>
            {interState ? (
              <span>IGST {money(totals.igst)}</span>
            ) : (
              <span>CGST + SGST {money(totals.cgst + totals.sgst)}</span>
            )}
            <span className="font-semibold text-text">Total {money(totals.total)}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-card-border/20 text-sm hover:bg-card/70">
              Cancel
            </button>
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white text-sm font-medium hover:bg-primary-orange/90 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Generate & download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
