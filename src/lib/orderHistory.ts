import { supabase } from "./supabase";

/**
 * An order's history, read through `order_history_for` (see migration
 * 20261116000000_order_history.sql): the trigger-kept record of changes to
 * the order, the payment ledger, and what can be reconstructed for orders
 * older than the record. Oldest first.
 */

export interface OrderHistoryEntry {
  id: string;
  happenedAt: string;
  event: "created" | "status" | "updated" | "items" | "edited" | "payment" | string;
  changes: Record<string, any>;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
  };
}

/** One line of an item change, as the edit popup writes it. */
export interface OrderItemChange {
  name: string;
  code?: string | null;
  from: number;
  to: number;
}

export async function fetchOrderHistory(orderId: string): Promise<OrderHistoryEntry[]> {
  const { data, error } = await supabase.rpc("order_history_for", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return ((data as any[]) || []).map((row) => ({
    id: row.id,
    happenedAt: row.happened_at,
    event: row.event,
    changes: row.changes || {},
    actor: {
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email,
      role: row.actor_role,
    },
  }));
}

/**
 * Records what the edit popup changed in an order's lines. The order row's own
 * fields are recorded by trigger; the lines are not, because the popup rewrites
 * them wholesale and only it knows which ones really changed.
 */
export async function recordItemChanges(orderId: string, items: OrderItemChange[]) {
  if (items.length === 0) return;
  const { error } = await supabase
    .from("order_history")
    .insert([{ order_id: orderId, event: "items", changes: { items } }]);
  // The edit itself has been saved; a missing history line is not worth
  // telling the person who saved it that their edit failed.
  if (error) console.warn("Order history insert failed:", error);
}

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  lr_number: "LR number",
  full_name: "Name",
  email: "Email",
  phone: "Phone",
  alternate_phone: "Alternate phone",
  address: "Address",
  city: "City",
  district: "District",
  state: "State",
  pincode: "PIN",
  referred_by: "Referred by",
  total_amount: "Order total",
  discount_amt: "Discount",
  discount_percentage: "Discount %",
  payment_method: "Payment method",
};

const MONEY_FIELDS = new Set(["total_amount", "discount_amt"]);

const rupees = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;

function showValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY_FIELDS.has(field)) return rupees(value);
  return String(value);
}

function fieldLines(changes: Record<string, any>, skip: string[] = []): string[] {
  return Object.entries(changes)
    .filter(([field, change]) => !skip.includes(field) && change && typeof change === "object" && "to" in change)
    .map(([field, change]) => {
      const label = FIELD_LABELS[field] ?? field;
      return "from" in change
        ? `${label}: ${showValue(field, change.from)} → ${showValue(field, change.to)}`
        : `${label}: ${showValue(field, change.to)}`;
    });
}

function itemLines(items: OrderItemChange[]): string[] {
  return items.map((item) => {
    const name = item.code ? `${item.name} (${item.code})` : item.name;
    if (!item.from) return `Added ${name} × ${item.to}`;
    if (!item.to) return `Removed ${name} (was ${item.from})`;
    return `${name}: qty ${item.from} → ${item.to}`;
  });
}

/** A heading and detail lines for one entry, in the words staff use. */
export function describeHistoryEntry(entry: OrderHistoryEntry): {
  title: string;
  lines: string[];
  note?: string;
} {
  const c = entry.changes;
  const reconstructed = c.reconstructed
    ? "Recorded before order history was kept"
    : undefined;

  switch (entry.event) {
    case "created":
      return {
        title: "Order placed",
        lines: [`Order total: ${rupees(c.total_amount?.to)}`],
        note: reconstructed,
      };

    case "status": {
      const status = c.status || {};
      return {
        title: status.from
          ? `Status: ${status.from} → ${status.to}`
          : `Status: ${status.to}`,
        lines: fieldLines(c, ["status"]),
        note: reconstructed,
      };
    }

    case "updated": {
      const fields = Object.keys(c);
      const only = (...names: string[]) => fields.every((f) => names.includes(f));
      return {
        title: only("lr_number")
          ? c.lr_number?.from
            ? "LR number changed"
            : "LR number added"
          : only("discount_amt", "discount_percentage")
            ? "Discount changed"
            : "Order details changed",
        lines: fieldLines(c),
      };
    }

    case "items":
      return { title: "Items changed", lines: itemLines(c.items || []) };

    // Rows kept by the old order_audits table. Their item changes name the
    // product by id only, which means nothing to read, so they are counted.
    case "edited": {
      const lines = fieldLines(c, ["items"]);
      const itemCount = Array.isArray(c.items) ? c.items.length : 0;
      if (itemCount > 0) {
        lines.push(`${itemCount} product line${itemCount === 1 ? "" : "s"} changed`);
      }
      return { title: "Order edited", lines };
    }

    case "payment": {
      const amount = Number(c.amount || 0);
      const lines = [
        c.method && `Method: ${c.method}`,
        c.reference && `Reference: ${c.reference}`,
        c.note && `Note: ${c.note}`,
      ].filter(Boolean) as string[];
      return {
        title: amount < 0 ? `Refund of ${rupees(-amount)}` : `Payment of ${rupees(amount)} received`,
        lines,
      };
    }

    default:
      return { title: entry.event, lines: fieldLines(c) };
  }
}

/** Who did it. No actor on a placed order means guest checkout. */
export function historyActorLabel(entry: OrderHistoryEntry): string {
  const { name, email, id } = entry.actor;
  if (name?.trim() && email) return `${name.trim()} (${email})`;
  if (name?.trim()) return name.trim();
  if (email) return email;
  if (!id && entry.event === "created") return "Customer (guest checkout)";
  return id ? "Unknown user" : "System";
}
