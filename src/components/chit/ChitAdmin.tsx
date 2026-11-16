import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  IndianRupee,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  chitError,
  chitSummary,
  deletePlan,
  fetchChitPlans,
  setPlanActive,
  fetchEnrollments,
  rupees,
  type ChitEnrollment,
  type ChitPayment,
  type ChitPlan,
} from "../../lib/chit";
import { EnrollmentPill, ProgressBar, ScreenshotButton } from "./chitUi";
import { EnrollmentReview, PaymentReview } from "./ChitReview";
import { ChitMemberSheet } from "./ChitMemberSheet";
import { ChitPlanForm } from "./ChitPlanForm";
import { chitReceiptShareRequest } from "./ChitReceiptButtons";
import { SendPdfOnWhatsAppDialog, type SendPdfRequest } from "../SendPdfOnWhatsAppDialog";
import { useAppSettings } from "../../context/AppSettingsContext";
import { businessFromSettings } from "../../lib/businessDetails";

type Tab = "approvals" | "members" | "plans";
type Row = ChitEnrollment & { payments: ChitPayment[] };

/**
 * The whole chit scheme on one screen, for superadmins: what is waiting for
 * approval, every member with where they stand, and the plans themselves.
 * Approvals lead because they are the only thing here that is waiting on
 * someone.
 */
export function ChitAdmin() {
  const [plans, setPlans] = useState<ChitPlan[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("approvals");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "due" | "pending" | "closed">("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<ChitPlan | null | "new">(null);
  /** The receipt being sent on WhatsApp, if any. */
  const [shareRequest, setShareRequest] = useState<SendPdfRequest | null>(null);
  const { settings } = useAppSettings();
  const business = businessFromSettings(settings);

  /** The plan whose activate / delete is in flight, so its buttons can wait. */
  const [planBusy, setPlanBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [planRows, enrollmentRows] = await Promise.all([fetchChitPlans(true), fetchEnrollments()]);
      setPlans(planRows);
      setRows(enrollmentRows);
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withSummary = useMemo(
    () => rows.map((row) => ({ row, summary: chitSummary(row, row.payments) })),
    [rows]
  );

  const pendingEnrollments = rows.filter((r) => r.status === "pending");
  const pendingPayments = rows.flatMap((r) =>
    r.payments.filter((p) => p.status === "pending").map((p) => ({ payment: p, enrollment: r }))
  );
  const approvalsCount = pendingEnrollments.length + pendingPayments.length;

  const active = withSummary.filter(({ row }) => row.status === "active");
  const stats = {
    members: active.length,
    collected: withSummary.reduce((s, { summary }) => s + summary.paid, 0),
    dueNow: active.reduce((s, { summary }) => s + summary.dueNow, 0),
    overdue: active.filter(({ summary }) => summary.overdueMonths > 0).length,
  };

  const membersPerPlan = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.status === "pending" || r.status === "active") acc[r.plan_id] = (acc[r.plan_id] || 0) + 1;
    return acc;
  }, {});

  // Everyone who has ever enrolled, past members included: their chit still
  // points at the plan, which is what stops it being deleted.
  const everEnrolled = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.plan_id] = (acc[r.plan_id] || 0) + 1;
    return acc;
  }, {});

  const togglePlan = async (plan: ChitPlan) => {
    setPlanBusy(plan.id);
    try {
      await setPlanActive(plan.id, !plan.is_active);
      toast.success(
        plan.is_active
          ? `${plan.name} is inactive: no new members can join`
          : `${plan.name} is open for joining`
      );
      await load();
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setPlanBusy(null);
    }
  };

  const removePlan = async (plan: ChitPlan) => {
    const enrolled = everEnrolled[plan.id] ?? 0;
    if (enrolled > 0) {
      toast.error(
        `${plan.name} can't be deleted: ${enrolled} member${enrolled === 1 ? " has" : "s have"} enrolled in it` +
          ` (past members included). Make it inactive instead to stop new enrolments.`,
        { duration: 8000 }
      );
      return;
    }
    if (!window.confirm(`Delete ${plan.name}? This cannot be undone.`)) return;
    setPlanBusy(plan.id);
    try {
      await deletePlan(plan.id);
      toast.success(`${plan.name} deleted`);
      await load();
    } catch (error) {
      toast.error(chitError(error), { duration: 8000 });
    } finally {
      setPlanBusy(null);
    }
  };

  const filtered = withSummary.filter(({ row, summary }) => {
    const term = search.trim().toLowerCase();
    if (
      term &&
      ![row.member_name, row.phone, row.email ?? "", row.plan_name].some((v) => v.toLowerCase().includes(term))
    ) {
      return false;
    }
    if (planFilter !== "all" && row.plan_id !== planFilter) return false;
    if (statusFilter === "active") return row.status === "active";
    if (statusFilter === "due") return row.status === "active" && summary.dueNow > 0;
    if (statusFilter === "pending") return row.status === "pending";
    if (statusFilter === "closed") return ["completed", "cancelled", "rejected"].includes(row.status);
    return true;
  });

  const open = openId ? rows.find((r) => r.id === openId) : null;

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* At a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "To approve", value: String(approvalsCount), icon: Clock, tone: approvalsCount ? "text-amber-600" : "", go: "approvals" as Tab },
          { label: "Active members", value: String(stats.members), icon: Users, tone: "", go: "members" as Tab },
          { label: "Collected", value: rupees(stats.collected), icon: IndianRupee, tone: "text-green-700 dark:text-green-400", go: "members" as Tab },
          {
            label: "Due now",
            value: rupees(stats.dueNow),
            icon: AlertTriangle,
            tone: stats.dueNow ? "text-red-600" : "",
            note: stats.overdue ? `${stats.overdue} member${stats.overdue === 1 ? "" : "s"} overdue` : undefined,
            go: "members" as Tab,
          },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => {
              setTab(card.go);
              if (card.label === "Due now") setStatusFilter("due");
            }}
            className="text-left rounded-2xl bg-card p-4 hover:shadow-md transition-shadow"
          >
            <p className="flex items-center gap-1.5 text-xs text-text/60">
              <card.icon className="w-4 h-4" /> {card.label}
            </p>
            <p className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${card.tone}`}>{card.value}</p>
            {card.note && <p className="text-xs text-red-600">{card.note}</p>}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-card overflow-x-auto">
          {(
            [
              ["approvals", `To approve${approvalsCount ? ` (${approvalsCount})` : ""}`],
              ["members", `Members (${rows.length})`],
              ["plans", `Plans (${plans.length})`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === key ? "bg-primary-orange text-white" : "text-text/70 hover:bg-background/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="ml-auto p-2.5 rounded-xl bg-card hover:bg-card/70"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {tab === "approvals" && (
        <div className="space-y-6">
          {approvalsCount === 0 && (
            <p className="rounded-2xl bg-card p-8 text-center text-text/60">Nothing waiting. All caught up 🎉</p>
          )}

          {pendingPayments.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">Payments to verify ({pendingPayments.length})</h3>
              <div className="space-y-3">
                {pendingPayments.map(({ payment, enrollment }) => (
                  <div key={payment.id} className="rounded-2xl bg-card p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <button onClick={() => setOpenId(enrollment.id)} className="font-semibold hover:text-primary-orange text-left">
                          {enrollment.member_name}
                        </button>
                        <p className="text-xs text-text/60">
                          {enrollment.plan_name} · {enrollment.phone}
                        </p>
                        <p className="text-sm mt-1 break-all">
                          <b className="tabular-nums">{rupees(payment.amount)}</b>
                          <span className="text-text/60">
                            {" "}· {payment.method ?? "—"} · <span className="font-mono">{payment.transaction_ref}</span> · paid{" "}
                            {format(new Date(payment.paid_on), "dd MMM")}
                          </span>
                        </p>
                        {payment.user_note && <p className="text-xs text-text/60">“{payment.user_note}”</p>}
                      </div>
                      <ScreenshotButton path={payment.screenshot_path} className="shrink-0 rounded-lg border border-primary-orange/30 px-2.5 py-1.5" />
                    </div>
                    <PaymentReview
                      payment={payment}
                      memberName={enrollment.member_name}
                      onDone={load}
                      // Straight to sending the receipt: the moment it is
                      // approved is when the member is waiting to hear.
                      onApproved={(approved) =>
                        setShareRequest(
                          chitReceiptShareRequest(
                            enrollment,
                            [...enrollment.payments.filter((p) => p.id !== approved.id), approved],
                            approved,
                            business
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {pendingEnrollments.length > 0 && (
            <section>
              <h3 className="font-semibold mb-2">Enrolment requests ({pendingEnrollments.length})</h3>
              <div className="space-y-3">
                {pendingEnrollments.map((e) => (
                  <div key={e.id} className="rounded-2xl bg-card p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{e.member_name}</p>
                        <p className="text-xs text-text/60 break-all">
                          {e.phone}
                          {e.email && ` · ${e.email}`} · asked {format(new Date(e.created_at), "dd MMM, h:mm a")}
                        </p>
                        <p className="text-sm mt-1">
                          {e.plan_name} — <b>{rupees(e.monthly_amount)}</b> × {e.months}
                        </p>
                        {e.user_note && <p className="text-xs text-text/60">“{e.user_note}”</p>}
                      </div>
                    </div>
                    <EnrollmentReview
                      enrollment={e}
                      planStartsOn={plans.find((p) => p.id === e.plan_id)?.starts_on}
                      onDone={load}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/50" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email or plan"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-card border border-card-border/20 focus:outline-none focus:border-primary-orange"
              />
            </div>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-card border border-card-border/20"
              aria-label="Plan"
            >
              <option value="all">All plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["due", "Payment due"],
                ["pending", "Awaiting approval"],
                ["closed", "Closed"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
                  statusFilter === key ? "bg-primary-orange text-white border-primary-orange" : "bg-card border-card-border/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-2xl bg-card p-8 text-center text-text/60">No members match.</p>
          ) : (
            <div className="rounded-2xl bg-card divide-y divide-card-border/10 overflow-hidden">
              {filtered.map(({ row, summary }) => (
                <button
                  key={row.id}
                  onClick={() => setOpenId(row.id)}
                  className="w-full text-left p-4 hover:bg-background/40 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{row.member_name}</span>
                      <EnrollmentPill status={row.status} />
                      {row.payments.some((p) => p.status === "pending") && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                          Payment to verify
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text/60 truncate">
                      {row.phone} · {row.plan_name} ({rupees(row.monthly_amount)} × {row.months})
                    </p>
                    {row.status !== "pending" && row.status !== "rejected" && (
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={summary.progress} className="flex-1 max-w-xs" />
                        <span className="text-xs tabular-nums text-text/70 whitespace-nowrap">
                          {rupees(summary.paid)} / {rupees(summary.target)}
                        </span>
                        {row.status === "active" && summary.dueNow > 0 && (
                          <span className={`text-xs font-semibold whitespace-nowrap ${summary.overdueMonths ? "text-red-600" : "text-primary-orange"}`}>
                            {rupees(summary.dueNow)} due
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-text/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "plans" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setEditingPlan("new")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-orange text-white font-semibold"
            >
              <Plus className="w-4 h-4" /> New plan
            </button>
          </div>
          {plans.length === 0 ? (
            <p className="rounded-2xl bg-card p-8 text-center text-text/60">No plans yet. Create the first one.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.id} className={`rounded-2xl bg-card p-4 ${plan.is_active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{plan.name}</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {rupees(plan.monthly_amount)}
                        <span className="text-sm font-normal text-text/60"> × {plan.months}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setEditingPlan(plan)}
                      className="p-2 rounded-lg text-primary-orange hover:bg-background/60"
                      aria-label={`Edit ${plan.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                    <div className="rounded-lg bg-background/60 p-1.5">
                      <p className="text-text/60">Pays</p>
                      <p className="font-semibold">{rupees(plan.total_paid)}</p>
                    </div>
                    <div className="rounded-lg bg-background/60 p-1.5">
                      <p className="text-text/60">Bonus</p>
                      <p className="font-semibold">{rupees(plan.bonus_amount)}</p>
                    </div>
                    <div className="rounded-lg bg-primary-orange/10 p-1.5">
                      <p className="text-text/60">Gets</p>
                      <p className="font-semibold text-primary-orange">{rupees(plan.total_value)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-text/60">
                    {membersPerPlan[plan.id] ?? 0} member{membersPerPlan[plan.id] === 1 ? "" : "s"}
                    {plan.max_members ? ` of ${plan.max_members}` : ""} · due by the {plan.due_day}th
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        plan.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {plan.is_active ? "Active" : "Inactive"}
                    </span>
                    {/* Inactive: off the chit page and closed to new members;
                        those already on it carry on as before. */}
                    <button
                      onClick={() => togglePlan(plan)}
                      disabled={planBusy === plan.id}
                      title={plan.is_active ? "Stop new enrolments" : "Open for new enrolments"}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-card-border/20 hover:bg-background/60 disabled:opacity-40"
                    >
                      {planBusy === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                      {plan.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => removePlan(plan)}
                      disabled={planBusy === plan.id}
                      title={
                        everEnrolled[plan.id]
                          ? "Has members, so it cannot be deleted"
                          : "Delete this plan"
                      }
                      aria-label={`Delete ${plan.name}`}
                      className={`p-1.5 rounded-lg border disabled:opacity-40 ${
                        everEnrolled[plan.id]
                          ? "border-card-border/20 text-text/30"
                          : "border-red-200 text-red-600 hover:bg-red-50"
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <ChitMemberSheet
          enrollment={open}
          payments={open.payments}
          plans={plans}
          business={business}
          onShare={setShareRequest}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
      <SendPdfOnWhatsAppDialog request={shareRequest} onClose={() => setShareRequest(null)} />

      {editingPlan && (
        <ChitPlanForm
          plan={editingPlan === "new" ? null : editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={() => {
            setEditingPlan(null);
            load();
          }}
        />
      )}
    </div>
  );
}
