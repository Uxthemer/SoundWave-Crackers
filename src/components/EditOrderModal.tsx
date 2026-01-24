import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

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
};

type Props = {
  order: OrderForEdit;
  onClose: () => void;
  onSaved: (updated: OrderForEdit) => void;
};

export default function EditOrderModal({ order, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [addressOpen, setAddressOpen] = useState(true);
  const [productsOpen, setProductsOpen] = useState(false);

  const [form, setForm] = useState<OrderForEdit>(() => ({ ...order }));
  const [items, setItems] = useState<OrderItemLocal[]>(
    () =>
      (order.items || []).map((it) => ({
        ...it,
      })) || []
  );

  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [addingProductId, setAddingProductId] = useState<string>("");
  const [addingQty, setAddingQty] = useState<number>(1);
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

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,product_code,stock,offer_price")
        .order("name", { ascending: true })
        .limit(500);
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
    }
  };

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
      `Remove product "${it.product.name}" from order? This will be recorded in audit.`
    );
    if (!confirmed) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addProductToOrder = () => {
    if (!addingProductId) return;
    const product = productOptions.find((p) => p.id === addingProductId);
    if (!product) return;
    // check if already exists
    const existsIdx = items.findIndex((it) => it.product_id === product.id);
    if (existsIdx >= 0) {
      // just increase qty
      updateItemQty(existsIdx, items[existsIdx].quantity + addingQty);
    } else {
      const price = product.price || 0;
      setItems((prev) => [
        ...prev,
        {
          _isNew: true,
          product_id: product.id,
          quantity: addingQty,
          price,
          total_price: +(addingQty * price),
          product: { name: product.name, product_code: product.product_code },
        },
      ]);
    }
    setAddingProductId("");
    setAddingQty(1);
  };

  const computeTotals = () => {
    const total = items.reduce((s, it) => s + (it.total_price || 0), 0);
    return { total };
  };

  const buildChangesAudit = (original: OrderForEdit, updated: OrderForEdit) => {
    // Minimal deep compare for main fields + items summary
    const changes: any = {};
    const keysToCheck = [
      "full_name",
      "email",
      "phone",
      "alternate_phone",
      "address",
      "city",
      "state",
      "pincode",
      "status",
      "status",
      "payment_method",
      "discount_amt",
      "discount_percentage"
    ];
    keysToCheck.forEach((k) => {
      if ((original as any)[k] !== (updated as any)[k]) {
        changes[k] = { from: (original as any)[k], to: (updated as any)[k] };
      }
    });

    const origItemsMap = (original.items || []).reduce((acc: any, it: any) => {
      acc[it.product_id] = it.quantity;
      return acc;
    }, {});
    const newItemsMap = (updated.items || []).reduce((acc: any, it: any) => {
      acc[it.product_id] = it.quantity;
      return acc;
    }, {});

    const itemsChanges: any[] = [];
    const allProductIds = Array.from(
      new Set([...Object.keys(origItemsMap), ...Object.keys(newItemsMap)])
    );
    for (const pid of allProductIds) {
      const from = origItemsMap[pid] || 0;
      const to = newItemsMap[pid] || 0;
      if (from !== to) itemsChanges.push({ product_id: pid, from, to });
    }
    if (itemsChanges.length) changes.items = itemsChanges;
    return changes;
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    let itemsDeleted = false;

    try {
      // compute updated order object
      const updatedOrder: OrderForEdit = {
        ...form,
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

      // build audit object
      const changes = buildChangesAudit(order, updatedOrder);

      // compute stock deltas: newQty - oldQty per product
      const oldQtyMap = (order.items || []).reduce((acc: any, it: any) => {
        acc[it.product_id] = (acc[it.product_id] || 0) + (it.quantity || 0);
        return acc;
      }, {});
      const newQtyMap = (updatedOrder.items || []).reduce(
        (acc: any, it: any) => {
          acc[it.product_id] = (acc[it.product_id] || 0) + (it.quantity || 0);
          return acc;
        },
        {}
      );
      const productDelta: Record<string, number> = {};
      const allPids = Array.from(
        new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])
      );
      for (const pid of allPids) {
        productDelta[pid] = (newQtyMap[pid] || 0) - (oldQtyMap[pid] || 0); // positive => need to reduce stock
      }

      // validate stock for increases
      for (const pid of Object.keys(productDelta)) {
        const delta = productDelta[pid];
        if (delta <= 0) continue;
        const { data: prod, error: pErr } = await supabase
          .from("products")
          .select("stock")
          .eq("id", pid)
          .single();
        if (pErr) throw pErr;
        const currentStock = prod?.stock || 0;
        if (currentStock < delta) {
          throw new Error(
            `Insufficient stock for product ${pid}. Available ${currentStock}, required ${delta}.`
          );
        }
      }

      // 1) Update orders row
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          full_name: updatedOrder.full_name,
          email: updatedOrder.email,
          phone: updatedOrder.phone,
          alternate_phone: updatedOrder.alternate_phone || null,
          address: updatedOrder.address,
          city: updatedOrder.city,
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

      const itemsToInsert = (updatedOrder.items || []).map((it) => ({
        order_id: updatedOrder.id,
        product_id: it.product_id,
        quantity: it.quantity,
        price: it.price,
        total_price: it.total_price,
      }));

      if (itemsToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("order_items")
          .insert(itemsToInsert);
        if (insErr) throw insErr;
      }

      // 3) Update product stocks based on productDelta
      for (const pid of Object.keys(productDelta)) {
        const delta = productDelta[pid];
        if (delta === 0) continue;
        // delta > 0 => reduce stock by delta
        // delta < 0 => increase stock by -delta
        const { data: prod, error: pErr } = await supabase
          .from("products")
          .select("stock")
          .eq("id", pid)
          .single();
        if (pErr) {
          console.error("Failed to read product for stock update:", pErr);
          continue;
        }
        const currentStock = prod?.stock || 0;
        const newStock = Math.max(0, currentStock - delta);
        const { error: updErr } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", pid);
        if (updErr) {
          console.error("Failed to update product stock:", updErr);
        }
      }

      // 4) Insert audit record
      const auditPayload = {
        order_id: updatedOrder.id,
        changed_by: user?.id || null,
        changes,
        created_at: new Date().toISOString(),
      };
      const { error: auditErr } = await supabase
        .from("order_audits")
        .insert([auditPayload]);
      if (auditErr) console.warn("Audit insert failed:", auditErr);

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
            product_id: it.product_id,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold">
            Edit Order: {form.short_id || form.id}
          </h3>
          <div className="space-x-2">
            <button onClick={onClose} className="px-3 py-1 rounded bg-gray-200">
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded bg-primary-orange text-white"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Address Accordion */}
          <div className="border rounded">
            <button
              className="w-full text-left px-4 py-2 flex justify-between items-center"
              onClick={() => setAddressOpen((s) => !s)}
            >
              <span className="font-semibold">Address & Shipping Details</span>
              <span>{addressOpen ? "−" : "+"}</span>
            </button>
            {addressOpen && (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={form.full_name}
                    onChange={(e) =>
                      setForm({ ...form, full_name: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="Full name"
                  />
                  <input
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="Email"
                  />
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="Phone"
                  />
                  <input
                    value={form.alternate_phone || ""}
                    onChange={(e) =>
                      setForm({ ...form, alternate_phone: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="Alternate phone"
                  />
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="p-2 border rounded col-span-1 md:col-span-2"
                    placeholder="Address"
                  />
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="p-2 border rounded"
                    placeholder="City"
                  />
                  <input
                    value={form.state}
                    onChange={(e) =>
                      setForm({ ...form, state: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="State"
                  />
                  <input
                    value={form.pincode}
                    onChange={(e) =>
                      setForm({ ...form, pincode: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="PIN"
                  />
                </div>
                 <input
                    value={form.referred_by || ""}
                    onChange={(e) =>
                      setForm({ ...form, referred_by: e.target.value })
                    }
                    className="p-2 border rounded"
                    placeholder="Referred by phone"
                  />
              </div>
            )}
          </div>

          {/* Products Accordion */}
          <div className="border rounded">
            <button
              className="w-full text-left px-4 py-2 flex justify-between items-center"
              onClick={() => setProductsOpen((s) => !s)}
            >
              <span className="font-semibold">Products</span>
              <span>{productsOpen ? "−" : "+"}</span>
            </button>
            {productsOpen && (
              <div className="p-4 space-y-3">
                <div className="overflow-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-card/50">
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Price</th>
                        <th className="p-2 text-right">Total</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{it.product.name}</td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) =>
                                updateItemQty(
                                  idx,
                                  Math.max(1, Number(e.target.value))
                                )
                              }
                              className="w-20 p-1 border rounded text-center"
                            />
                          </td>
                          <td className="p-2 text-right">
                            ₹{it.price?.toFixed?.(2) ?? it.price}
                          </td>
                          <td className="p-2 text-right">
                            ₹
                            {(it.total_price || it.quantity * it.price).toFixed(
                              2
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeItem(idx)}
                              className="px-2 py-1 rounded bg-red-100 text-red-700"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-4 text-center text-text/60"
                          >
                            No products
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <select
                    value={addingProductId}
                    onChange={(e) => setAddingProductId(e.target.value)}
                    className="p-2 border rounded"
                  >
                    <option value="">Select product to add</option>
                    {productOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.product_code || p.id}) - Stock: {p.stock}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={addingQty}
                    onChange={(e) =>
                      setAddingQty(Math.max(1, Number(e.target.value)))
                    }
                    className="p-2 border rounded"
                    placeholder="Qty"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addProductToOrder}
                      className="px-3 py-2 rounded bg-primary-orange text-white"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAddingProductId("");
                        setAddingQty(1);
                      }}
                      className="px-3 py-2 rounded bg-gray-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="text-right pt-2">
                  <div className="font-semibold">
                    Subtotal: ₹{computeTotals().total.toFixed(2)}
                  </div>
                </div>

                {/* Discount Section */}
                <div className="border-t pt-2 mt-2">
                   <h4 className="font-semibold mb-2">Discount</h4>
                   <div className="flex items-center gap-4 mb-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDiscountType("amount")}
                          className={`px-3 py-1 rounded text-sm border ${
                            discountType === "amount"
                              ? "bg-primary-orange text-white border-primary-orange"
                              : "bg-gray-100 text-gray-700 border-gray-300"
                          }`}
                        >
                          ₹ Amount
                        </button>
                        <button
                          onClick={() => setDiscountType("percentage")}
                          className={`px-3 py-1 rounded text-sm border ${
                            discountType === "percentage"
                              ? "bg-primary-orange text-white border-primary-orange"
                              : "bg-gray-100 text-gray-700 border-gray-300"
                          }`}
                        >
                          % Percentage
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={discountType === "amount" ? "Amount" : "Percentage"}
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        className="p-1 border rounded w-28"
                      />
                   </div>
                   <div className="text-right space-y-1">
                      <div>
                        Discount: -₹
                        {discountType === "percentage"
                          ? ((computeTotals().total * (Number(discountInput) || 0)) / 100).toFixed(2)
                          : (Number(discountInput) || 0).toFixed(2)
                        }
                      </div>
                      <div className="font-bold text-lg text-primary-orange">
                         Grand Total: ₹
                         {(
                           computeTotals().total - 
                           (discountType === "percentage"
                             ? (computeTotals().total * (Number(discountInput) || 0)) / 100
                             : Number(discountInput) || 0)
                         ).toFixed(2)}
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-red-600">{error}</div>}
        </div>
      </div>
    </div>
  );
}
