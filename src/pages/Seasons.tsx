import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Copy,
  CheckCircle2,
  Lock,
  Unlock,
  Search,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useSeasons, useSeasonActions, Season } from "../context/SeasonContext";

interface CarryRow {
  product_id: string;
  name: string;
  product_code: string | null;
  closingStock: number;
  carry: boolean;
}

interface SeasonSummary {
  productCount: number;
  totalStock: number;
  /** Used to spot products the live season has but a draft does not. */
  productIds: Set<string>;
}

export function Seasons() {
  const { userRole } = useAuth();
  const { seasons, activeSeason, loading } = useSeasons();
  const {
    createSeason,
    updateSeason,
    copyForward,
    activateSeason,
    closeSeason,
    setSeasonUnlocked,
  } = useSeasonActions();

  const [summaries, setSummaries] = useState<Record<string, SeasonSummary>>({});
  const [busy, setBusy] = useState(false);

  // Create-season form
  const [showCreate, setShowCreate] = useState(false);
  const [newSeason, setNewSeason] = useState({
    code: "",
    name: "",
    start_date: "",
    end_date: "",
  });

  // Edit-season form
  const [editing, setEditing] = useState<Season | null>(null);
  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    start_date: "",
    end_date: "",
  });

  // Copy-forward wizard
  const [copyOpen, setCopyOpen] = useState(false);
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [carryRows, setCarryRows] = useState<CarryRow[]>([]);
  const [carrySearch, setCarrySearch] = useState("");
  const [loadingCarry, setLoadingCarry] = useState(false);

  const isAdmin = ["admin", "superadmin"].includes(userRole?.name || "");
  const isSuperadmin = userRole?.name === "superadmin";

  useEffect(() => {
    if (seasons.length > 0) loadSummaries();
  }, [seasons.length]);

  const loadSummaries = async () => {
    const { data } = await supabase
      .from("product_seasons")
      .select("season_id, product_id, stock");

    const next: Record<string, SeasonSummary> = {};
    (data || []).forEach((row: any) => {
      if (!next[row.season_id]) {
        next[row.season_id] = {
          productCount: 0,
          totalStock: 0,
          productIds: new Set<string>(),
        };
      }
      next[row.season_id].productCount += 1;
      next[row.season_id].totalStock += Number(row.stock || 0);
      next[row.season_id].productIds.add(row.product_id);
    });
    setSummaries(next);
  };

  /**
   * Products the live season has that the given draft does not.
   *
   * A product added to the live season after a copy-forward never reaches the
   * draft, and nothing else surfaces that.
   */
  const missingFromDraft = (draftId: string): number => {
    if (!activeSeason || activeSeason.id === draftId) return 0;
    const live = summaries[activeSeason.id];
    if (!live) return 0;
    const draft = summaries[draftId];
    if (!draft) return live.productCount;

    let missing = 0;
    live.productIds.forEach((id) => {
      if (!draft.productIds.has(id)) missing += 1;
    });
    return missing;
  };

  const handleSyncMissing = async (draft: Season) => {
    if (!activeSeason) return;
    setBusy(true);
    try {
      // copy_season_products is ON CONFLICT DO NOTHING, so this inserts only
      // the products the draft lacks and leaves its edited prices alone. The
      // empty carry array means they start at zero stock, which is right for a
      // product that did not exist when the season was copied.
      const inserted = await copyForward(activeSeason.id, draft.id, []);
      toast.success(
        inserted > 0
          ? `Added ${inserted} missing product${inserted === 1 ? "" : "s"} to ${draft.name}`
          : `${draft.name} is already up to date`
      );
      await loadSummaries();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  /** Suggests the next season following the most recent one. */
  const suggestNextSeason = () => {
    const latest = [...seasons].sort((a, b) =>
      a.start_date < b.start_date ? 1 : -1
    )[0];

    const startYear = latest
      ? new Date(latest.start_date).getFullYear() + 1
      : new Date().getFullYear();

    setNewSeason({
      code: String(startYear),
      name: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
      // A season runs April 1 -> March 31, matching how the business reports.
      start_date: `${startYear}-04-01`,
      end_date: `${startYear + 1}-03-31`,
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!newSeason.code || !newSeason.name || !newSeason.start_date || !newSeason.end_date) {
      toast.error("Fill in every field");
      return;
    }
    setBusy(true);
    try {
      await createSeason(newSeason);
      toast.success(`Season ${newSeason.name} created as a draft`);
      setShowCreate(false);
      setNewSeason({ code: "", name: "", start_date: "", end_date: "" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to create season");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (season: Season) => {
    setEditing(season);
    setEditForm({
      code: season.code,
      name: season.name,
      // <input type="date"> needs a bare yyyy-mm-dd value.
      start_date: String(season.start_date).slice(0, 10),
      end_date: String(season.end_date).slice(0, 10),
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (!editForm.code || !editForm.name || !editForm.start_date || !editForm.end_date) {
      toast.error("Fill in every field");
      return;
    }
    if (editForm.end_date <= editForm.start_date) {
      toast.error("End date must be after the start date");
      return;
    }
    setBusy(true);
    try {
      await updateSeason(editing.id, editForm);
      toast.success(`Season ${editForm.name} updated`);
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update season");
    } finally {
      setBusy(false);
    }
  };

  const openCopyWizard = (target: Season) => {
    setTargetId(target.id);

    // Prefer the live season, but only if it actually has a catalog —
    // otherwise fall back to the most recent season that does, so the wizard
    // never opens on an empty list.
    const hasProducts = (id: string) => (summaries[id]?.productCount ?? 0) > 0;
    const candidates = seasons.filter((s) => s.id !== target.id);
    const suggestedSource =
      (activeSeason && activeSeason.id !== target.id && hasProducts(activeSeason.id)
        ? activeSeason.id
        : undefined) ??
      [...candidates]
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
        .find((s) => hasProducts(s.id))?.id ??
      "";

    setSourceId(suggestedSource);
    setCarryRows([]);
    setCarrySearch("");
    setCopyOpen(true);
    if (suggestedSource) loadCarryRows(suggestedSource);
  };

  const loadCarryRows = async (fromSeasonId: string) => {
    if (!fromSeasonId) return;
    setLoadingCarry(true);
    try {
      const { data, error } = await supabase
        .from("season_catalog")
        .select("id, name, product_code, stock, closing_stock")
        .eq("season_id", fromSeasonId)
        .order("order", { nullsFirst: false })
        .order("name");

      if (error) throw error;

      setCarryRows(
        (data || []).map((r: any) => ({
          product_id: r.id,
          name: r.name,
          product_code: r.product_code,
          // A closed season has closing_stock stamped; a live one has not yet.
          closingStock: Number(r.closing_stock ?? r.stock ?? 0),
          carry: true, // default is to carry, per the agreed behaviour
        }))
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to load source catalog");
    } finally {
      setLoadingCarry(false);
    }
  };

  const visibleCarryRows = useMemo(() => {
    const q = carrySearch.trim().toLowerCase();
    if (!q) return carryRows;
    return carryRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.product_code || "").toLowerCase().includes(q)
    );
  }, [carryRows, carrySearch]);

  const carriedCount = carryRows.filter((r) => r.carry).length;
  const carriedUnits = carryRows
    .filter((r) => r.carry)
    .reduce((s, r) => s + r.closingStock, 0);

  const setAllCarry = (value: boolean) => {
    const visible = new Set(visibleCarryRows.map((r) => r.product_id));
    setCarryRows((rows) =>
      rows.map((r) => (visible.has(r.product_id) ? { ...r, carry: value } : r))
    );
  };

  const handleCopy = async () => {
    if (!sourceId || !targetId) return;
    setBusy(true);
    try {
      const carryIds = carryRows.filter((r) => r.carry).map((r) => r.product_id);
      const inserted = await copyForward(sourceId, targetId, carryIds);
      toast.success(
        inserted > 0
          ? `Copied ${inserted} products forward (${carryIds.length} carrying stock)`
          : "Nothing to copy — the target season already has these products"
      );
      setCopyOpen(false);
      await loadSummaries();
    } catch (e: any) {
      toast.error(e?.message || "Copy failed");
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (season: Season) => {
    if (
      !confirm(
        `Make season ${season.name} live?\n\nThe storefront will immediately sell from this season's products and prices.` +
          (activeSeason ? `\n\nSeason ${activeSeason.name} will be closed.` : "")
      )
    )
      return;

    setBusy(true);
    try {
      await activateSeason(season.id);
      toast.success(`Season ${season.name} is now live`);
      await loadSummaries();
    } catch (e: any) {
      toast.error(e?.message || "Failed to activate season");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (season: Season) => {
    if (
      !confirm(
        `Close season ${season.name}?\n\nClosing stock is recorded and the season becomes read-only.`
      )
    )
      return;

    setBusy(true);
    try {
      await closeSeason(season.id);
      toast.success(`Season ${season.name} closed`);
      await loadSummaries();
    } catch (e: any) {
      toast.error(e?.message || "Failed to close season");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async (season: Season) => {
    const unlocking = !season.is_unlocked;
    if (
      unlocking &&
      !confirm(
        `Unlock season ${season.name} for editing?\n\nThis lets archived prices and stock be changed. It is recorded in the audit log.`
      )
    )
      return;

    setBusy(true);
    try {
      await setSeasonUnlocked(season.id, unlocking);
      toast.success(unlocking ? "Season unlocked" : "Season re-locked");
    } catch (e: any) {
      toast.error(e?.message || "Failed to change lock");
    } finally {
      setBusy(false);
    }
  };

  // Guarded here rather than only on the route: ProtectedRoute's requiredRole
  // is not enforced, so page-level checks are what actually hold.
  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const statusPill = (season: Season) => {
    if (season.status === "active")
      return (
        <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">
          Live
        </span>
      );
    if (season.status === "draft")
      return (
        <span className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
          Draft
        </span>
      );
    return (
      <span className="px-3 py-1 rounded-full text-sm bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-200">
        {season.is_unlocked ? "Closed · unlocked" : "Closed"}
      </span>
    );
  };

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4">
          <h1 className="font-heading text-4xl">Seasons</h1>
          <button
            onClick={suggestNextSeason}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New season</span>
          </button>
        </div>

        <p className="text-text/70 mb-8 max-w-3xl">
          Each season holds its own prices, cost and stock. Build next season as
          a draft while the current one keeps selling, then make it live when
          you're ready. Closed seasons are frozen as an archive.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
          </div>
        ) : (
          <div className="grid gap-4">
            {seasons.map((season) => {
              const summary = summaries[season.id];
              return (
                <div
                  key={season.id}
                  className="bg-card/30 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h2 className="text-xl font-semibold">
                        Season {season.name}
                      </h2>
                      {statusPill(season)}
                    </div>
                    <p className="text-sm text-text/60">
                      {format(new Date(season.start_date), "d MMM yyyy")} —{" "}
                      {format(new Date(season.end_date), "d MMM yyyy")}
                    </p>
                    <p className="text-sm text-text/70 mt-1">
                      {summary
                        ? `${summary.productCount} products · ${summary.totalStock} units in stock`
                        : "No catalog yet"}
                    </p>

                    {/* A product added to the live season after this draft was
                        copied never reaches it. Surface that rather than let it
                        go unnoticed until the season goes live. */}
                    {season.status === "draft" &&
                      summary &&
                      missingFromDraft(season.id) > 0 && (
                        <p className="text-sm mt-2 text-amber-700 dark:text-amber-400">
                          {missingFromDraft(season.id)} product
                          {missingFromDraft(season.id) === 1 ? "" : "s"} in{" "}
                          {activeSeason?.name}{" "}
                          {missingFromDraft(season.id) === 1 ? "is" : "are"} not
                          in this season —{" "}
                          <button
                            onClick={() => handleSyncMissing(season)}
                            disabled={busy}
                            className="underline font-semibold hover:no-underline disabled:opacity-40"
                          >
                            Sync missing
                          </button>
                        </p>
                      )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEdit(season)}
                      disabled={busy}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </button>

                    {season.status !== "closed" && (
                      <button
                        onClick={() => openCopyWizard(season)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40"
                      >
                        <Copy className="w-4 h-4" />
                        <span>Copy from…</span>
                      </button>
                    )}

                    {season.status === "draft" && (
                      <button
                        onClick={() => handleActivate(season)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Make live</span>
                      </button>
                    )}

                    {season.status === "active" && (
                      <button
                        onClick={() => handleClose(season)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors disabled:opacity-40"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Close season</span>
                      </button>
                    )}

                    {season.status === "closed" && isSuperadmin && (
                      <button
                        onClick={() => handleToggleLock(season)}
                        disabled={busy}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 ${
                          season.is_unlocked
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : "bg-card hover:bg-card/70"
                        }`}
                      >
                        {season.is_unlocked ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <Unlock className="w-4 h-4" />
                        )}
                        <span>
                          {season.is_unlocked ? "Re-lock" : "Unlock to edit"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create season */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading text-2xl mb-4">New season</h2>
            <div className="grid gap-4">
              <div>
                <label className="block mb-1 font-medium">Code</label>
                <input
                  value={newSeason.code}
                  onChange={(e) =>
                    setNewSeason((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="2027"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Name</label>
                <input
                  value={newSeason.name}
                  onChange={(e) =>
                    setNewSeason((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="2027-28"
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 font-medium">Starts</label>
                  <input
                    type="date"
                    value={newSeason.start_date}
                    onChange={(e) =>
                      setNewSeason((f) => ({ ...f, start_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Ends</label>
                  <input
                    type="date"
                    value={newSeason.end_date}
                    onChange={(e) =>
                      setNewSeason((f) => ({ ...f, end_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-card hover:bg-card/70"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit season — name, code and period. Renaming or re-dating a season
          does not move any data; the catalog stays attached by id. */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading text-2xl mb-1">Edit season</h2>
            <p className="text-sm text-text/60 mb-4">
              Products, prices and stock stay attached to this season —
              only its label and period change.
            </p>
            <div className="grid gap-4">
              <div>
                <label className="block mb-1 font-medium">Code</label>
                <input
                  value={editForm.code}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, code: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 font-medium">Starts</label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, start_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Ends</label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, end_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-card border border-card-border/10"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-text/50 mt-4">
              Changing the period affects which orders fall into this season for
              any report that filters by date rather than by season.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg bg-card hover:bg-card/70"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy-forward wizard */}
      {copyOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <h2 className="font-heading text-2xl mb-1">Copy season forward</h2>
            <p className="text-sm text-text/70 mb-4">
              Prices, cost, content and display order are copied. Stock carries
              only for the products you tick — everything else starts at zero.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  loadCarryRows(e.target.value);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-card border border-card-border/10 w-full"
              >
                <option value="">Select source season…</option>
                {/* Product counts are shown so an empty season is obvious
                    rather than silently producing a blank table. */}
                {seasons
                  .filter((s) => s.id !== targetId)
                  .map((s) => {
                    const count = summaries[s.id]?.productCount ?? 0;
                    return (
                      <option key={s.id} value={s.id} disabled={count === 0}>
                        Season {s.name} —{" "}
                        {count === 0 ? "no products" : `${count} products`}
                      </option>
                    );
                  })}
              </select>
              <ArrowRight className="w-5 h-5 text-text/50 hidden sm:block" />
              <div className="flex-1 px-3 py-2 rounded-lg bg-card/50 border border-card-border/10 w-full text-center">
                Season {seasons.find((s) => s.id === targetId)?.name ?? "—"}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="relative flex-1">
                <input
                  value={carrySearch}
                  onChange={(e) => setCarrySearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/60" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAllCarry(true)}
                  className="px-3 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
                >
                  Carry all shown
                </button>
                <button
                  onClick={() => setAllCarry(false)}
                  className="px-3 py-2 rounded-lg bg-card hover:bg-card/70 text-sm"
                >
                  Carry none shown
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-card-border/10 rounded-lg">
              {loadingCarry ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-orange" />
                </div>
              ) : visibleCarryRows.length === 0 ? (
                <div className="text-center py-12 text-text/60 px-6">
                  {!sourceId ? (
                    <p>Pick a source season to begin.</p>
                  ) : carryRows.length === 0 ? (
                    <>
                      <p className="font-medium mb-1">
                        Season{" "}
                        {seasons.find((s) => s.id === sourceId)?.name} has no
                        products.
                      </p>
                      <p className="text-sm">
                        Pick a season that has a catalog — the dropdown above
                        shows how many products each one holds.
                      </p>
                    </>
                  ) : (
                    <p>No products match “{carrySearch}”.</p>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-card/50 sticky top-0">
                    <tr>
                      <th className="py-2 px-4 text-left">Carry stock</th>
                      <th className="py-2 px-4 text-left">Product</th>
                      <th className="py-2 px-4 text-left">Code</th>
                      <th className="py-2 px-4 text-right">Closing stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCarryRows.map((row) => (
                      <tr
                        key={row.product_id}
                        className="border-t border-card-border/10"
                      >
                        <td className="py-2 px-4">
                          <input
                            type="checkbox"
                            checked={row.carry}
                            onChange={(e) =>
                              setCarryRows((rows) =>
                                rows.map((r) =>
                                  r.product_id === row.product_id
                                    ? { ...r, carry: e.target.checked }
                                    : r
                                )
                              )
                            }
                            className="w-4 h-4 accent-primary-orange"
                          />
                        </td>
                        <td className="py-2 px-4">{row.name}</td>
                        <td className="py-2 px-4 text-text/60">
                          {row.product_code || "—"}
                        </td>
                        <td className="py-2 px-4 text-right">
                          {row.closingStock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
              <p className="text-sm text-text/70">
                {carryRows.length} products will be copied ·{" "}
                <span className="font-semibold text-primary-orange">
                  {carriedCount}
                </span>{" "}
                carrying {carriedUnits} units of stock
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCopyOpen(false)}
                  className="px-4 py-2 rounded-lg bg-card hover:bg-card/70"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCopy}
                  disabled={busy || !sourceId || carryRows.length === 0}
                  className="px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-40"
                >
                  {busy ? "Copying…" : "Copy forward"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
