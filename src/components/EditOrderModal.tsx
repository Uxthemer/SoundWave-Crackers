import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Trash2, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { NumberInput } from "./NumberInput";
import { CustomerPhoneLookup } from "./CustomerPhoneLookup";
import { CustomerMatch, customerOrderExtras } from "../lib/customerLookup";
import { cleanDelivery, deliveryProblem } from "../lib/deliveryDetails";
import { recordItemChanges, type OrderItemChange } from "../lib/orderHistory";
import Select from "react-select";
import { useStatesAndDistricts } from "../hooks/useStatesAndDistricts";

type ProductOption = {
  id: string;
  name: string;
  product_code?: string;
  stock: number;
  price?: number;
};

type OrderItemLocal = {
  id?: string;
  product_id: string;
  /** Set on a family-pack line, which has no product_id. */
  combo_pack_id?: string | null;
  quantity: number;
  price: number;
  total_price: number;
  product: {
    id?: string;
    name: string;
    product_code?: string;
    categories?: { name?: string } | any;
  };
  _isNew?: boolean;
};

export type OrderForEdit = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  alternate_phone?: string;
  address: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  total_amount: number;
  status: string;
  payment_method?: string;
  items?: OrderItemLocal[];
  discount_amt?: number;
  discount_percentage?: string;
  short_id?: string;
  referred_by?: string;
  /** Season this order belongs to. Stock and prices resolve against it. */
  season_id?: string | null;
};

type Props = {
  order: OrderForEdit;
  onClose: () => void;
  onSaved: (updated: OrderForEdit) => void;
};

/** A line is a product or a pack; either id identifies it within the order. */
const lineKey = (it: { product_id?: string | null; combo_pack_id?: string | null }) =>
  it.combo_pack_id || it.product_id || "";

/** How many matches the product search lists at once. */
const MAX_RESULTS = 30;

/** 16px on phones: iOS zooms the page into any smaller field it focuses. */
const FIELD =
  "w-full px-3 py-2 rounded-lg bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange text-base sm:text-sm";

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-text/60 mb-1">{label}</span>
      {children}
    </label>
  );
}

/**
 * The same as Field, for a picker. A <label> passes every click inside it on
 * to react-select's hidden input, which opens and shuts the menu under the
 * finger.
 */
function PickerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-medium text-text/60 mb-1">{label}</span>
      {children}
    </div>
  );
}

/**
 * The pickers' menus are drawn on <body>: inside this popup's scrolling body
 * they would be cut off at its edge. 16px text, as with FIELD, keeps iOS from
 * zooming in on focus.
 */
const selectProps = {
  classNamePrefix: "react-select",
  menuPortalTarget: typeof document !== "undefined" ? document.body : null,
  menuPlacement: "auto" as const,
  styles: {
    menuPortal: (base: object) => ({ ...base, zIndex: 9999 }),
    control: (base: object) => ({ ...base, minHeight: 40, fontSize: 16 }),
    menu: (base: object) => ({ ...base, fontSize: 16 }),
  },
};

export default function EditOrderModal({ order, onClose, onSaved }: Props) {
  const [addressOpen, setAddressOpen] = useState(true);
  const [productsOpen, setProductsOpen] = useState(true);

  const [form, setForm] = useState<OrderForEdit>(() => ({ ...order }));
  const [items, setItems] = useState<OrderItemLocal[]>(
    () =>
      (order.items || []).map((it) => ({
        ...it,
      })) || []
  );

  /** The Orders page opens this with an empty id for New Order. */
  const isNewOrder = !order.id;

  const fillFromCustomer = async (customer: CustomerMatch) => {
    setForm((f) => ({
      ...f,
      phone: customer.phone,
      full_name: customer.name,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      district: customer.district,
      state: customer.state,
      pincode: customer.pincode,
    }));
    setCustomerSearch("");
    const extras = await customerOrderExtras(customer.phone);
    setForm((f) => ({
      ...f,
      alternate_phone: extras.alternatePhone || f.alternate_phone,
      // The summary's district is the latest order's, which may be blank.
      district: customer.district.trim() ? f.district : extras.district || f.district,
    }));
  };
  const [customerSearch, setCustomerSearch] = useState("");

  const { states, districts, canonicalState, canonicalDistrict } =
    useStatesAndDistricts(form.state || "");
  const stateOptions = states.map((s) => ({ value: s.name, label: s.name }));
  const districtOptions = districts.map((d) => ({ value: d.name, label: d.name }));

  // As in the cart: an order typed as "tamil nadu " or "coimbatore" is put in
  // the lists' own spelling once they arrive, so the pickers show it selected
  // and the districts load. Set directly, because changing the state through
  // its picker would empty the district.
  useEffect(() => {
    const canonical = form.state ? canonicalState(form.state) : undefined;
    if (canonical && canonical !== form.state) {
      setForm((f) => ({ ...f, state: canonical }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, form.state]);
  useEffect(() => {
    const canonical = form.district ? canonicalDistrict(form.district) : undefined;
    if (canonical && canonical !== form.district) {
      setForm((f) => ({ ...f, district: canonical }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, form.district]);

  // Orders placed before seasons existed were backfilled, but guard anyway.
  const orderSeasonId = order.season_id ?? null;

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  // Discount State
  const [discountType, setDiscountType] = useState<"amount" | "percentage">("amount");
  const [discountInput, setDiscountInput] = useState<string>("");

  useEffect(() => {
    // Initialize discount state from props
    if (order.discount_percentage && Number(order.discount_percentage) > 0) {
      setDiscountType("percentage");
      setDiscountInput(order.discount_percentage);
    } else {
      setDiscountType("amount");
      setDiscountInput(order.discount_amt ? String(order.discount_amt) : "");
    }
  }, [order]);

  useEffect(() => {
    setForm({ ...order });
    setItems((order.items || []).map((it) => ({ ...it })));
    // lazy load products
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // The page behind should not scroll under a finger working in this popup.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const fetchProducts = async () => {
    try {
      // Offer the catalog for the order's own season, so editing a past order
      // shows the products and prices that applied when it was placed.
      if (!orderSeasonId) {
        setProductOptions([]);
        return;
      }

      setProductsLoading(true);
      const { data, error } = await supabase
        .from("season_catalog")
        .select("id,name,product_code,stock,offer_price")
        .eq("season_id", orderSeasonId)
        // Only what is on sale can be added. A line already on the order for
        // a product since switched off is in `items`, not this list, so it
        // stays on the order untouched.
        .eq("is_active", true)
        .order("order", { nullsFirst: false })
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      if (data) {
        const formattedData = data.map((item) => ({
          ...item,
          price: item.offer_price,
        }));
        setProductOptions((formattedData as any) || []);
      }
    } catch (e) {
      console.error("Failed to fetch products:", e);
    } finally {
      setProductsLoading(false);
    }
  };

  /**
   * Products matching what is typed: every word must appear in the name or
   * the code, so "100 wala" and "wala 100" both find 100 Wala.
   */
  const productMatches = useMemo(() => {
    const words = productQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return productOptions
      .filter((p) => {
        const haystack = `${p.name} ${p.product_code ?? ""}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, MAX_RESULTS);
  }, [productQuery, productOptions]);

  useEffect(() => setHighlight(0), [productQuery]);

  const qtyInOrder = (productId: string) =>
    items.find((it) => !it.combo_pack_id && it.product_id === productId)?.quantity ?? 0;

  const updateItemQty = (idx: number, qty: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, quantity: qty, total_price: +(qty * it.price) }
          : it
      )
    );
  };

  const removeItem = (idx: number) => {
    const it = items[idx];
    const confirmed = window.confirm(
      `Remove "${it.product.name}" from this order? This will be recorded in the order's history.`
    );
    if (!confirmed) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * Adds one of a product, or one more if it is already on the order, and
   * clears the search for the next one -- adding several products is type,
   * tap, type, tap.
   */
  const addProduct = (product: ProductOption) => {
    const existsIdx = items.findIndex(
      (it) => !it.combo_pack_id && it.product_id === product.id
    );
    if (existsIdx >= 0) {
      updateItemQty(existsIdx, items[existsIdx].quantity + 1);
    } else {
      const price = product.price || 0;
      setItems((prev) => [
        ...prev,
        {
          _isNew: true,
          product_id: product.id,
          quantity: 1,
          price,
          total_price: price,
          product: { name: product.name, product_code: product.product_code },
        },
      ]);
    }
    toast.success(`${product.name} added`, { duration: 1500 });
    setProductQuery("");
    searchRef.current?.focus();
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, productMatches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = productMatches[highlight];
      if (pick) addProduct(pick);
    } else if (e.key === "Escape" && productQuery) {
      e.stopPropagation();
      setProductQuery("");
    }
  };

  const computeTotals = () => {
    const total = items.reduce((s, it) => s + (it.total_price || 0), 0);
    return { total };
  };

  /**
   * What changed in the order's lines, by name, for the order's history. The
   * order row's own fields are recorded by a database trigger when it is
   * saved; the lines are rewritten wholesale below, so only this knows which
   * of them really changed.
   */
  const itemChanges = (
    before: OrderItemLocal[],
    after: OrderItemLocal[]
  ): OrderItemChange[] => {
    const describe = new Map<string, { name: string; code?: string | null }>();
    const count = (lines: OrderItemLocal[]) =>
      lines.reduce<Record<string, number>>((acc, it) => {
        const key = lineKey(it);
        describe.set(key, { name: it.product?.name ?? "Item", code: it.product?.product_code ?? null });
        acc[key] = (acc[key] || 0) + (it.quantity || 0);
        return acc;
      }, {});
    const from = count(before);
    const to = count(after);
    return Array.from(new Set([...Object.keys(from), ...Object.keys(to)]))
      .filter((key) => (from[key] || 0) !== (to[key] || 0))
      .map((key) => ({
        ...describe.get(key)!,
        from: from[key] || 0,
        to: to[key] || 0,
      }));
  };

  const handleSave = async () => {
    setError("");

    // Trimmed and checked by the cart's own rules (lib/deliveryDetails), so a
    // correction made here is stored the way a new order would be.
    const clean = cleanDelivery({
      customerName: form.full_name,
      // A guest order with no email is stored as "-"; that is a placeholder,
      // not an address to check.
      email: form.email === "-" ? "" : form.email,
      phone: form.phone,
      alternatePhone: form.alternate_phone || "",
      referralPhone: form.referred_by || "",
      address: form.address,
      city: form.city,
      state: form.state,
      district: form.district || "",
      pincode: form.pincode,
      country: "India",
    });
    const problem = deliveryProblem(clean, "edit");
    if (problem) {
      setError(problem);
      setAddressOpen(true);
      return;
    }
    const cleanedForm: OrderForEdit = {
      ...form,
      full_name: clean.customerName,
      email: clean.email || (form.email === "-" ? "-" : ""),
      phone: clean.phone,
      alternate_phone: clean.alternatePhone,
      referred_by: clean.referralPhone,
      address: clean.address,
      city: clean.city,
      state: clean.state,
      district: clean.district,
      pincode: clean.pincode,
    };
    setForm(cleanedForm);

    setSaving(true);
    let itemsDeleted = false;

    try {
      // compute updated order object
      const updatedOrder: OrderForEdit = {
        ...cleanedForm,
        items: items.map((it) => ({
          ...it,
          total_price: +(it.quantity * it.price),
        })),
      };
      const totals = computeTotals();

      // Calculate Discount
      let finalAmt = 0;
      let finalPercent = null;
      if (discountType === "percentage") {
        const pct = Number(discountInput) || 0;
        finalPercent = pct.toString();
        finalAmt = (totals.total * pct) / 100;
      } else {
        finalAmt = Number(discountInput) || 0;
        finalPercent = null;
      }

      updatedOrder.total_amount = totals.total; // Gross Total
      updatedOrder.discount_amt = finalAmt;
      updatedOrder.discount_percentage = finalPercent as any;

      const changedItems = itemChanges(order.items || [], updatedOrder.items || []);

      // compute stock deltas: newQty - oldQty per product
      // Pack lines are skipped: what they consume lives in the pack, and the
      // database works it out. Only plain product lines are checked here.
      const countByProduct = (items: any[]) =>
        (items || []).reduce((acc: any, it: any) => {
          if (!it.product_id || it.combo_pack_id) return acc;
          acc[it.product_id] = (acc[it.product_id] || 0) + (it.quantity || 0);
          return acc;
        }, {});
      const oldQtyMap = countByProduct(order.items as any[]);
      const newQtyMap = countByProduct(updatedOrder.items as any[]);
      const productDelta: Record<string, number> = {};
      const allPids = Array.from(
        new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])
      );
      for (const pid of allPids) {
        productDelta[pid] = (newQtyMap[pid] || 0) - (oldQtyMap[pid] || 0); // positive => need to reduce stock
      }

      // validate stock for increases — against the order's own season
      if (!orderSeasonId && Object.values(productDelta).some((d) => d > 0)) {
        throw new Error(
          "This order is not linked to a season, so stock cannot be adjusted."
        );
      }

      for (const pid of Object.keys(productDelta)) {
        const delta = productDelta[pid];
        if (delta <= 0) continue;
        const { data: prod, error: pErr } = await supabase
          .from("product_seasons")
          .select("stock")
          .eq("product_id", pid)
          .eq("season_id", orderSeasonId)
          .single();
        if (pErr) throw pErr;
        const currentStock = prod?.stock || 0;
        if (currentStock < delta) {
          const name =
            updatedOrder.items?.find((it) => it.product_id === pid)?.product.name ?? pid;
          throw new Error(
            `Not enough stock for ${name}: ${currentStock} available, ${delta} more needed.`
          );
        }
      }

      // 1) Update orders row. Its changes reach the order's history by
      // trigger (orders_record_history).
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          full_name: updatedOrder.full_name,
          email: updatedOrder.email,
          phone: updatedOrder.phone,
          alternate_phone: updatedOrder.alternate_phone || null,
          address: updatedOrder.address,
          city: updatedOrder.city,
          district: updatedOrder.district || null,
          state: updatedOrder.state,
          pincode: updatedOrder.pincode,
          total_amount: updatedOrder.total_amount,
          discount_amt: updatedOrder.discount_amt,
          discount_percentage: updatedOrder.discount_percentage,
          referred_by: updatedOrder.referred_by || null,
        })
        .eq("id", updatedOrder.id);
      if (orderErr) throw orderErr;

      // 2) Replace order_items: easiest approach - delete all then insert new (keeps DB consistent)
      const { error: delErr } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", updatedOrder.id);
      if (delErr) throw delErr;
      itemsDeleted = true;

      const lineRow = (orderId: string, it: OrderItemLocal) => ({
        order_id: orderId,
        // A line is a product or a pack, never both — the rows are rewritten
        // wholesale here, so a pack line has to keep its pack.
        product_id: it.combo_pack_id ? null : it.product_id,
        combo_pack_id: it.combo_pack_id ?? null,
        quantity: it.quantity,
        price: it.price,
        total_price: it.total_price,
      });

      const itemsToInsert = (updatedOrder.items || []).map((it) =>
        lineRow(updatedOrder.id, it)
      );

      if (itemsToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("order_items")
          .insert(itemsToInsert);
        if (insErr) throw insErr;
      }
      itemsDeleted = false;

      // Stock is not written here. Deleting the old lines gives their stock
      // back and inserting the new ones takes it again, both through the
      // order_items triggers, so the difference settles itself — and a pack
      // line settles on the products inside the pack, which this code could
      // not have known about.

      await recordItemChanges(updatedOrder.id, changedItems);

      // return updated structure to caller
      onSaved(updatedOrder);
      onClose();
      toast.success("Order updated successfully");
    } catch (e: any) {
      console.error("Failed to save order edits:", e);
      setError(e?.message || "Failed to save changes");

      // Rollback: Restore original items if they were deleted but new ones failed to insert
      if (itemsDeleted) {
        toast.error("Error occurred. Attempting to rollback...");
        try {
          const originalItemsToInsert = (order.items || []).map((it) => ({
            order_id: order.id,
            product_id: it.combo_pack_id ? null : it.product_id,
            combo_pack_id: it.combo_pack_id ?? null,
            quantity: it.quantity,
            price: it.price,
            total_price: it.total_price,
          }));

          if (originalItemsToInsert.length > 0) {
            const { error: rollbackError } = await supabase
              .from("order_items")
              .insert(originalItemsToInsert);
            if (rollbackError) throw rollbackError;
          }
          console.log("Rollback successful: Original items restored.");
          toast.success("Rollback successful. No data was lost.");
        } catch (rollbackError) {
          console.error("CRITICAL: Rollback failed", rollbackError);
          setError(
            "Failed to save changes AND failed to restore original items. Please contact support immediately."
          );
          toast.error("Critical Error: Rollback failed!");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const subtotal = computeTotals().total;
  const discountAmount =
    discountType === "percentage"
      ? (subtotal * (Number(discountInput) || 0)) / 100
      : Number(discountInput) || 0;
  const grandTotal = subtotal - discountAmount;
  const totalQuantity = items.reduce((s, it) => s + (it.quantity || 0), 0);

  return (
    // Full screen on a phone, with the header and the save bar pinned, so
    // Save is always one tap away however long the order is.
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 sm:p-4">
      <div className="bg-background sm:rounded-xl w-full sm:max-w-3xl flex flex-col h-full sm:h-auto sm:max-h-[92vh]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-card-border/10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">{isNewOrder ? "New order" : "Edit order"}</h3>
            {!isNewOrder && (
              <p className="text-xs font-mono text-text/60 truncate">
                {form.short_id || form.id}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-card/60 shrink-0"
            aria-label="Close without saving"
            title="Close without saving"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Address Accordion */}
          <section className="border border-card-border/20 rounded-lg">
            <button
              className="w-full text-left px-4 py-3 flex justify-between items-center"
              onClick={() => setAddressOpen((s) => !s)}
              aria-expanded={addressOpen}
            >
              <span className="font-semibold">Customer & delivery</span>
              {addressOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {addressOpen && (
              <div className="px-4 pb-4 space-y-3">
                {/* A new order starts from the phone: picking an existing
                    customer fills everything below. Editing an order keeps
                    its own details, so the lookup is not offered there. */}
                {isNewOrder && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Find existing customer{" "}
                      <span className="font-normal text-text/60">
                        — by name, phone, city, district, address or pincode
                      </span>
                    </label>
                    <CustomerPhoneLookup
                      mode="any"
                      value={customerSearch}
                      onChange={setCustomerSearch}
                      onSelect={fillFromCustomer}
                      placeholder="e.g. Ravi Chennai, 600042, 97897…"
                      className={FIELD}
                    />
                  </div>
                )}
                {isNewOrder && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Phone{" "}
                      <span className="font-normal text-text/60">
                        — type to find an existing customer
                      </span>
                    </label>
                    <CustomerPhoneLookup
                      value={form.phone}
                      onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                      onSelect={fillFromCustomer}
                      className={FIELD}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Name *">
                    <input
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      className={FIELD}
                      autoComplete="off"
                    />
                  </Field>
                  {!isNewOrder && (
                    <Field label="Phone *">
                      <input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className={FIELD}
                        inputMode="tel"
                        autoComplete="off"
                      />
                    </Field>
                  )}
                  <Field label="Alternate phone">
                    <input
                      value={form.alternate_phone || ""}
                      onChange={(e) => setForm({ ...form, alternate_phone: e.target.value })}
                      className={FIELD}
                      inputMode="tel"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={FIELD}
                      inputMode="email"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Address" className="sm:col-span-2">
                    <textarea
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className={FIELD}
                      rows={2}
                    />
                  </Field>
                  {/* State and District are the cart's own pickers over the
                      same lists, so an order is corrected from the choices it
                      was placed with. */}
                  <PickerField label="State">
                    <Select
                      options={stateOptions}
                      value={
                        stateOptions.find((opt) => opt.value === form.state) ||
                        // A state the list does not know, from an old order:
                        // shown as it is rather than blanked.
                        (form.state ? { value: form.state, label: form.state } : null)
                      }
                      onChange={(option) =>
                        // A new state empties the district, as in the cart.
                        setForm((f) => ({ ...f, state: option?.value || "", district: "" }))
                      }
                      isClearable
                      placeholder="Select State"
                      {...selectProps}
                    />
                  </PickerField>
                  <PickerField label="District">
                    <Select
                      options={districtOptions}
                      value={
                        districtOptions.find((opt) => opt.value === form.district) ||
                        (form.district ? { value: form.district, label: form.district } : null)
                      }
                      onChange={(option) =>
                        setForm((f) => ({ ...f, district: option?.value || "" }))
                      }
                      isClearable
                      placeholder="Select District"
                      isDisabled={!form.state}
                      {...selectProps}
                    />
                  </PickerField>
                  <Field label="City">
                    <input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className={FIELD}
                    />
                  </Field>
                  <Field label="PIN code">
                    <input
                      value={form.pincode}
                      onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                      className={FIELD}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Country">
                    <input value="India" readOnly disabled className={`${FIELD} opacity-70`} />
                  </Field>
                  <Field label="Referred by – contact number">
                    <input
                      value={form.referred_by || ""}
                      onChange={(e) => setForm({ ...form, referred_by: e.target.value })}
                      className={FIELD}
                      inputMode="tel"
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>

          {/* Products Accordion */}
          <section className="border border-card-border/20 rounded-lg">
            <button
              className="w-full text-left px-4 py-3 flex justify-between items-center"
              onClick={() => setProductsOpen((s) => !s)}
              aria-expanded={productsOpen}
            >
              <span className="font-semibold">
                Products{" "}
                <span className="font-normal text-sm text-text/60">
                  ({items.length} lines, {totalQuantity} qty)
                </span>
              </span>
              {productsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {productsOpen && (
              <div className="px-4 pb-4 space-y-3">
                {/* Type to find a product; tap (or Enter) adds one. */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder={
                      orderSeasonId
                        ? "Add a product — type its name or code"
                        : "This order has no season, so products cannot be added"
                    }
                    disabled={!orderSeasonId}
                    className={`${FIELD} pl-9`}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={productMatches.length > 0}
                    aria-controls="edit-order-product-results"
                  />
                  {productsLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text/50" />
                  )}
                </div>
                {productQuery.trim() && (
                  <ul
                    id="edit-order-product-results"
                    role="listbox"
                    className="border border-card-border/20 rounded-lg max-h-72 overflow-y-auto divide-y divide-card-border/10"
                  >
                    {productMatches.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-text/60">
                        No product matches "{productQuery.trim()}".
                      </li>
                    ) : (
                      productMatches.map((p, i) => {
                        const inOrder = qtyInOrder(p.id);
                        return (
                          <li key={p.id} role="option" aria-selected={i === highlight}>
                            <button
                              type="button"
                              onClick={() => addProduct(p)}
                              onMouseEnter={() => setHighlight(i)}
                              className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 ${
                                i === highlight ? "bg-primary-orange/10" : "hover:bg-card/60"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block font-medium truncate">{p.name}</span>
                                <span className="block text-xs text-text/60">
                                  {p.product_code ? `${p.product_code} · ` : ""}₹
                                  {Number(p.price || 0).toFixed(2)} ·{" "}
                                  <span className={p.stock > 0 ? "" : "text-red-600"}>
                                    {p.stock > 0 ? `${p.stock} in stock` : "out of stock"}
                                  </span>
                                </span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                {inOrder > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-card">
                                    {inOrder} in order
                                  </span>
                                )}
                                <Plus className="w-5 h-5 text-primary-orange" />
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}

                {/* One card per line rather than a table: on a phone a table
                    pushes the quantity and Remove off screen. */}
                <ul className="space-y-2">
                  {items.map((it, idx) => (
                    <li
                      key={lineKey(it) || idx}
                      className={`rounded-lg border px-3 py-2.5 ${
                        it._isNew ? "border-green-600/40 bg-green-50/50 dark:bg-green-900/10" : "border-card-border/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{it.product.name}</p>
                          <p className="text-xs text-text/60">
                            {it.product.product_code ? `${it.product.product_code} · ` : ""}₹
                            {Number(it.price || 0).toFixed(2)} each
                            {it._isNew ? " · new" : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-2 -m-1 rounded-lg text-red-600 hover:bg-red-50 shrink-0"
                          aria-label={`Remove ${it.product.name}`}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center rounded-lg border border-card-border/20 overflow-hidden">
                          <button
                            onClick={() => updateItemQty(idx, Math.max(1, it.quantity - 1))}
                            disabled={it.quantity <= 1}
                            className="w-9 h-9 flex items-center justify-center hover:bg-card/60 disabled:opacity-30"
                            aria-label="One fewer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <NumberInput
                            min={1}
                            value={it.quantity}
                            onValueChange={(n) => updateItemQty(idx, Math.max(1, Math.round(n)))}
                            inputMode="numeric"
                            aria-label={`Quantity of ${it.product.name}`}
                            className="w-14 h-9 text-center bg-transparent border-x border-card-border/20 focus:outline-none text-base sm:text-sm no-spinner"
                          />
                          <button
                            onClick={() => updateItemQty(idx, it.quantity + 1)}
                            className="w-9 h-9 flex items-center justify-center hover:bg-card/60"
                            aria-label="One more"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="font-semibold whitespace-nowrap">
                          ₹{(it.total_price || it.quantity * it.price).toFixed(2)}
                        </p>
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="p-4 text-center text-text/60 text-sm">
                      No products. Search above to add one.
                    </li>
                  )}
                </ul>

                {/* Discount Section */}
                <div className="border-t border-card-border/20 pt-3">
                  <h4 className="font-semibold mb-2">Discount</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1">
                      {(["amount", "percentage"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setDiscountType(type)}
                          className={`px-3 py-1.5 rounded-full text-sm border ${
                            discountType === type
                              ? "bg-primary-orange text-white border-primary-orange"
                              : "bg-card border-card-border/20"
                          }`}
                        >
                          {type === "amount" ? "₹ Amount" : "% Percentage"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder={discountType === "amount" ? "Amount" : "Percentage"}
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className={`${FIELD} !w-32 no-spinner`}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-card-border/10 px-4 py-3 space-y-2 bg-background sm:rounded-b-xl">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm leading-tight">
              <p className="text-text/60">
                Subtotal ₹{subtotal.toFixed(2)}
                {discountAmount > 0 && ` − ₹${discountAmount.toFixed(2)}`}
              </p>
              <p className="font-bold text-lg text-primary-orange">₹{grandTotal.toFixed(2)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg bg-card hover:bg-card/70"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-orange text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
