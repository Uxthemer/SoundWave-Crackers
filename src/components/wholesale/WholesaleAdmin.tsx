import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Loader2, Mail, Phone, RefreshCw, Search, Trash2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import toast from "react-hot-toast";
import {
  ENQUIRY_TYPES,
  STATUS_LABEL,
  deleteWholesaleEnquiry,
  fetchWholesaleEnquiries,
  typeLabel,
  updateWholesaleEnquiry,
  wholesaleError,
  type EnquiryStatus,
  type WholesaleEnquiry,
} from "../../lib/wholesale";
import { ConfirmDialog } from "../chit/chitUi";

const STATUSES = Object.keys(STATUS_LABEL) as EnquiryStatus[];

/**
 * Every wholesale enquiry, newest first, for superadmins: all the details the
 * visitor gave, one tap to call, WhatsApp or email them, and a status and a
 * private note to track the follow-up. New ones lead until someone moves them.
 */
export function WholesaleAdmin({ onCountChange }: { onCountChange?: (newCount: number) => void }) {
  const [rows, setRows] = useState<WholesaleEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleting, setDeleting] = useState<WholesaleEnquiry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchWholesaleEnquiries();
      setRows(data);
      onCountChange?.(data.filter((r) => r.status === "new").length);
    } catch (error) {
      toast.error(wholesaleError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const patchRow = async (row: WholesaleEnquiry, patch: Partial<WholesaleEnquiry>, done?: string) => {
    try {
      await updateWholesaleEnquiry(row.id, patch as { status?: EnquiryStatus; admin_note?: string | null });
      setRows((prev) => {
        const next = prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r));
        onCountChange?.(next.filter((r) => r.status === "new").length);
        return next;
      });
      if (done) toast.success(done);
    } catch (error) {
      toast.error(wholesaleError(error));
    }
  };

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "all" && r.enquiry_type !== typeFilter) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [r.contact_name, r.business_name, r.phone, r.email, r.city, r.district, r.state, r.gstin, r.products, r.message]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter((r) => r.status === s).length;
    return acc;
  }, {});

  /** The list as filtered, every field, for a spreadsheet. */
  const exportCsv = () => {
    const columns: [string, (r: WholesaleEnquiry) => string][] = [
      ["Received", (r) => format(new Date(r.created_at), "yyyy-MM-dd HH:mm")],
      ["Status", (r) => STATUS_LABEL[r.status]?.[0] ?? r.status],
      ["Enquiry for", (r) => typeLabel(r.enquiry_type)],
      ["Business", (r) => r.business_name ?? ""],
      ["Business type", (r) => r.business_type ?? ""],
      ["Contact", (r) => r.contact_name],
      ["Phone", (r) => r.phone],
      ["Alternate phone", (r) => r.alternate_phone ?? ""],
      ["Email", (r) => r.email ?? ""],
      ["Prefers", (r) => r.preferred_contact ?? ""],
      ["GSTIN", (r) => r.gstin ?? ""],
      ["City", (r) => r.city ?? ""],
      ["District", (r) => r.district ?? ""],
      ["State", (r) => r.state ?? ""],
      ["PIN", (r) => r.pincode ?? ""],
      ["Budget", (r) => r.budget ?? ""],
      ["Products", (r) => r.products ?? ""],
      ["Message", (r) => r.message ?? ""],
      ["Our note", (r) => r.admin_note ?? ""],
    ];
    const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv =
      "﻿" +
      [columns.map(([h]) => h).join(","), ...filtered.map((r) => columns.map(([, get]) => cell(get(r))).join(","))].join(
        "\r\n"
      );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `wholesale-enquiries-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["new", "contacted", "quoted", "converted"] as EnquiryStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`text-left rounded-2xl p-4 transition-shadow hover:shadow-md ${
              statusFilter === s ? "bg-primary-orange/10 ring-2 ring-primary-orange/40" : "bg-card"
            }`}
          >
            <p className="text-xs text-text/60">{STATUS_LABEL[s][0]}</p>
            <p className={`text-2xl font-bold tabular-nums ${s === "new" && counts.new ? "text-red-600" : ""}`}>
              {counts[s]}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, business, phone, place, products…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl bg-card border border-card-border/20"
            aria-label="Enquiry type"
          >
            <option value="all">All enquiries</option>
            {ENQUIRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EnquiryStatus | "all")}
            className="flex-1 px-3 py-2.5 rounded-xl bg-card border border-card-border/20"
            aria-label="Status"
          >
            <option value="all">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s][0]}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} disabled={!filtered.length} className="p-2.5 rounded-xl bg-card hover:bg-card/70 disabled:opacity-40" title="Export as CSV" aria-label="Export as CSV">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={load} disabled={refreshing} className="p-2.5 rounded-xl bg-card hover:bg-card/70" title="Refresh" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <p className="text-sm text-text/60">
        {filtered.length === rows.length ? `${rows.length} enquiries` : `Showing ${filtered.length} of ${rows.length}`}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-center text-text/60">
          {rows.length ? "No enquiries match." : "No wholesale enquiries yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <EnquiryCard
              key={r.id}
              enquiry={r}
              onStatus={(status) => patchRow(r, { status }, `Marked ${STATUS_LABEL[status][0].toLowerCase()}`)}
              onNote={(note) => patchRow(r, { admin_note: note || null }, "Note saved")}
              onDelete={() => setDeleting(r)}
            />
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this enquiry?"
          confirmLabel="Delete"
          tone="reject"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await deleteWholesaleEnquiry(deleting.id);
              setRows((prev) => prev.filter((x) => x.id !== deleting.id));
              toast.success("Enquiry deleted");
              setDeleting(null);
            } catch (error) {
              toast.error(wholesaleError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            <b>{deleting.business_name || deleting.contact_name}</b>'s enquiry from{" "}
            {format(new Date(deleting.created_at), "dd MMM yyyy")} will be removed permanently. To keep it, mark it
            Closed instead.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function EnquiryCard({
  enquiry: r,
  onStatus,
  onNote,
  onDelete,
}: {
  enquiry: WholesaleEnquiry;
  onStatus: (status: EnquiryStatus) => void;
  onNote: (note: string) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(r.admin_note ?? "");
  const digits = r.phone.replace(/\D/g, "").slice(-10);
  const place = [r.city, r.district, r.state].filter((v, i, all) => v && all.indexOf(v) === i).join(", ");
  const [statusLabel, statusStyle] = STATUS_LABEL[r.status] ?? [r.status, "bg-gray-100"];

  const details: [string, string | null][] = [
    ["Business type", r.business_type],
    ["GSTIN", r.gstin],
    ["Alternate phone", r.alternate_phone],
    ["Email", r.email],
    ["Prefers", r.preferred_contact],
    ["Location", [place, r.pincode].filter(Boolean).join(" – ")],
    ["Budget", r.budget],
  ];

  return (
    <div className={`rounded-2xl bg-card p-4 sm:p-5 ${r.status === "new" ? "ring-1 ring-red-300" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-lg leading-tight break-words">{r.business_name || r.contact_name}</p>
          {r.business_name && <p className="text-sm text-text/70">{r.contact_name}</p>}
          <p className="text-xs text-text/50 mt-0.5">
            {format(new Date(r.created_at), "dd MMM yyyy, h:mm a")}
            {r.user_id ? " · signed-in customer" : " · guest"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-orange/10 text-primary-orange">
            {typeLabel(r.enquiry_type)}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle}`}>{statusLabel}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 rounded-xl border border-card-border/20 px-3 py-1.5 text-sm font-semibold hover:bg-background/60">
          <Phone className="w-4 h-4 text-primary-orange" /> {r.phone}
        </a>
        {digits.length === 10 && (
          <a
            href={`https://wa.me/91${digits}?text=${encodeURIComponent(`Hello ${r.contact_name}, thank you for your wholesale enquiry with SoundWave Crackers.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-green-600/30 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"
          >
            <FaWhatsapp className="w-4 h-4" /> WhatsApp
          </a>
        )}
        {r.email && (
          <a href={`mailto:${r.email}?subject=${encodeURIComponent("Your wholesale enquiry - SoundWave Crackers")}`} className="flex items-center gap-1.5 rounded-xl border border-card-border/20 px-3 py-1.5 text-sm font-semibold hover:bg-background/60">
            <Mail className="w-4 h-4 text-primary-orange" /> Email
          </a>
        )}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {details
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-2 min-w-0">
              <dt className="text-text/50 shrink-0">{k}</dt>
              <dd className="font-medium break-words min-w-0">{v}</dd>
            </div>
          ))}
      </dl>
      {r.products && (
        <div className="mt-3 rounded-xl bg-background/60 p-3 text-sm">
          <p className="text-xs text-text/50 mb-0.5">Products</p>
          <p className="whitespace-pre-wrap break-words">{r.products}</p>
        </div>
      )}
      {r.message && (
        <div className="mt-2 rounded-xl bg-background/60 p-3 text-sm">
          <p className="text-xs text-text/50 mb-0.5">Message</p>
          <p className="whitespace-pre-wrap break-words">{r.message}</p>
        </div>
      )}

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <select
          value={r.status}
          onChange={(e) => onStatus(e.target.value as EnquiryStatus)}
          className="px-3 py-2 rounded-xl bg-background border border-card-border/20 text-sm"
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s][0]}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (r.admin_note ?? "") && onNote(note)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          placeholder="Private note (saved when you leave the box)"
          className="flex-1 px-3 py-2 rounded-xl bg-background border border-card-border/20 text-sm"
        />
        <button
          onClick={onDelete}
          className="self-start sm:self-auto p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
          title="Delete enquiry"
          aria-label="Delete enquiry"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
