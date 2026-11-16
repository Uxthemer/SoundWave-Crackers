import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck, CalendarDays, CalendarX2, Gift, Globe, Loader2, MapPin, Phone, Truck, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { businessFromSettings } from "../lib/businessDetails";
import { usePageMeta } from "../lib/seo";
import {
  bonusMonth,
  chitError,
  fetchChitPlans,
  fetchEnrollments,
  fetchPlanMembers,
  ordinal,
  planMonth,
  rupees,
  type ChitEnrollment,
  type ChitPayment,
  type ChitPlan,
} from "../lib/chit";
import { PlanCard } from "../components/chit/PlanCard";
import { EnrollModal } from "../components/chit/EnrollModal";
import { PaymentModal } from "../components/chit/PaymentModal";
import { MyChitCard } from "../components/chit/MyChitCard";
import { ChitBanner } from "../components/chit/ChitBanner";

/**
 * The chit scheme, for customers. The banner leads; signed in, the member's
 * own chits follow -- what is paid, what is due and when, every payment and its
 * state -- then the plans, the scheme's dates, all plans side by side as on
 * the printed banner, and how to reach us.
 *
 * Joining needs an account: an enrolment and its payments belong to a person,
 * and the screenshots are kept in their own private folder.
 */
export function ChitScheme() {
  const { user, userProfile } = useAuth();
  const { settings } = useAppSettings();
  const business = businessFromSettings(settings);
  const navigate = useNavigate();
  const location = useLocation();
  const [plans, setPlans] = useState<ChitPlan[]>([]);
  const [members, setMembers] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<(ChitEnrollment & { payments: ChitPayment[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<ChitPlan | null>(null);
  const [paying, setPaying] = useState<{ enrollment: ChitEnrollment; suggested: number } | null>(null);

  usePageMeta({
    title: "Diwali Chit Scheme — Save monthly for crackers | SoundWave Crackers",
    description:
      "Join our monthly crackers chit scheme: pay from Rs. 500 a month for 9 months, we pay the 10th month, and get crackers worth up to Rs. 50,000 for Diwali.",
  });

  const load = useCallback(async () => {
    try {
      const [planRows, memberCounts, enrollments] = await Promise.all([
        fetchChitPlans(),
        fetchPlanMembers().catch(() => ({})),
        user ? fetchEnrollments(user.id) : Promise.resolve([]),
      ]);
      setPlans(planRows);
      setMembers(memberCounts);
      setMine(enrollments);
    } catch (error) {
      toast.error(chitError(error));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const join = (plan: ChitPlan) => {
    if (!user) {
      toast("Please log in to join a chit scheme.");
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    setJoining(plan);
  };

  const openPlanIds = new Set(
    mine.filter((e) => e.status === "pending" || e.status === "active").map((e) => e.plan_id)
  );
  // The middle plan reads as the default choice; with two, the second.
  const featuredId = plans.length >= 3 ? plans[Math.floor(plans.length / 2)]?.id : plans[1]?.id;

  // The scheme's calendar, from the plans on offer: the earliest start, the
  // latest end and dispatch. Shown only when the plans carry dates.
  const earliest = (values: (string | null | undefined)[]) => values.filter(Boolean).sort()[0] ?? null;
  const latest = (values: (string | null | undefined)[]) => values.filter(Boolean).sort().slice(-1)[0] ?? null;
  const season = plans.find((p) => p.season_label)?.season_label ?? null;
  const startsOn = earliest(plans.map((p) => p.starts_on));
  const endsOn = latest(plans.map((p) => p.ends_on));
  const dispatchOn = latest(plans.map((p) => p.dispatch_on));
  const phones = business.phone
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen pb-16">
      {/* Edge to edge, outside the content column: the banner is the page's
          headline, and at 2:1 it needs the width to stay readable. */}
      <ChitBanner />
      <div className="container mx-auto px-4 sm:px-6 max-w-6xl">

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <section className="mt-10">
                <h1 className="font-heading text-3xl sm:text-4xl mb-1">My chits</h1>
                <p className="text-text/60 mb-5">Your payments, what's due and when.</p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {mine.map((e) => (
                    <MyChitCard
                      key={e.id}
                      enrollment={e}
                      payments={e.payments}
                      onPay={(enrollment, suggested) => setPaying({ enrollment, suggested })}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-10">
              <div className="text-center max-w-2xl mx-auto mb-8">
                {mine.length === 0 ? (
                  <h1 className="font-heading text-3xl sm:text-5xl mb-3">
                    {season ? `${season} Chit Scheme` : "Chit Scheme"}
                  </h1>
                ) : (
                  <h2 className="font-heading text-3xl mb-3">Join another plan</h2>
                )}
                <p className="text-text/70">
                  Plan today, save monthly, celebrate bigger! Join our monthly chit and get your favourite
                  crackers for {season ?? "Diwali"} with added benefit.
                </p>
              </div>

              {/* How it works, in three steps. */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-3xl mx-auto mb-8">
                {[
                  [CalendarCheck, "Join a plan", "Pick a monthly amount"],
                  [Upload, "Pay monthly", "UPI, then upload the screenshot"],
                  [Gift, "Get more", "We add a month's value"],
                ].map(([Icon, title, text]) => {
                  const I = Icon as typeof CalendarCheck;
                  return (
                    <div key={title as string} className="text-center rounded-2xl bg-card p-3 sm:p-4">
                      <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-orange/10">
                        <I className="h-5 w-5 text-primary-orange" />
                      </span>
                      <p className="text-sm font-semibold">{title as string}</p>
                      <p className="text-[11px] sm:text-xs text-text/60 mt-0.5">{text as string}</p>
                    </div>
                  );
                })}
              </div>

              {/* The scheme's dates, as on the banner. */}
              {(startsOn || endsOn || dispatchOn) && (
                <div className="grid sm:grid-cols-3 gap-2 sm:gap-0 sm:divide-x divide-primary-orange/20 rounded-2xl border border-primary-orange/30 bg-primary-orange/5 p-3 sm:p-4 mb-10">
                  {[
                    [CalendarDays, "Scheme starts", startsOn ? planMonth(startsOn) : null, null],
                    [CalendarX2, "Scheme ends", endsOn ? planMonth(endsOn) : null, null],
                    [Truck, "Crackers dispatched", dispatchOn ? planMonth(dispatchOn) : null, "for members who complete the scheme"],
                  ]
                    .filter(([, , value]) => value)
                    .map(([Icon, label, value, note]) => {
                      const I = Icon as typeof CalendarDays;
                      return (
                        <div key={label as string} className="flex items-center gap-3 sm:justify-center px-2">
                          <I className="w-7 h-7 text-primary-orange shrink-0" />
                          <div>
                            <p className="text-xs text-text/60">{label as string}</p>
                            <p className="font-bold text-lg leading-tight">{value as string}</p>
                            {note && <p className="text-[11px] text-text/60">({note as string})</p>}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {plans.length === 0 ? (
                <p className="text-center text-text/60 py-10">New plans are coming soon.</p>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pt-3">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      members={members[plan.id]}
                      featured={plan.id === featuredId}
                      joined={openPlanIds.has(plan.id)}
                      onJoin={join}
                    />
                  ))}
                </div>
              )}
              {!user && plans.length > 0 && (
                <p className="mt-6 text-center text-sm text-text/60">You'll be asked to log in to join.</p>
              )}
            </section>

            {/* Every plan side by side, the way the printed banner lays them
                out -- the quickest way to compare. Scrolls sideways on a phone. */}
            {plans.length > 1 && (
              <section className="mt-12">
                <h2 className="font-heading text-2xl sm:text-3xl mb-4 text-center">All plans at a glance</h2>
                <div className="overflow-x-auto rounded-2xl border border-card-border/15">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-[#1e2a4a] text-white">
                        <th className="p-3 text-left">Scheme amount</th>
                        <th className="p-3 text-left">Monthly payment</th>
                        <th className="p-3 text-left">Duration</th>
                        <th className="p-3 text-left">Our benefit</th>
                        <th className="p-3 text-right">Crackers worth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((plan, i) => {
                        const free = bonusMonth(plan);
                        return (
                          <tr key={plan.id} className={i % 2 ? "bg-card" : "bg-background"}>
                            <td className="p-3 font-bold tabular-nums">{rupees(plan.monthly_amount)}</td>
                            <td className="p-3 tabular-nums">
                              {rupees(plan.monthly_amount)} × {plan.months} months
                            </td>
                            <td className="p-3">{plan.months} months</td>
                            <td className="p-3">
                              <span className="rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                {free ? `We pay the ${ordinal(free)} month` : `+ ${rupees(plan.bonus_amount)} bonus`}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold tabular-nums text-primary-orange">
                              {rupees(plan.total_value)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* How to reach us: from Admin Settings → Business & GST. */}
            <section className="mt-12 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-card p-4 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-orange/10">
                  <Phone className="h-5 w-5 text-primary-orange" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-text/60">Contact / enquiry</p>
                  {phones.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className="block font-semibold hover:text-primary-orange"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              </div>
              {business.address && (
                <div className="rounded-2xl bg-card p-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-orange/10">
                    <MapPin className="h-5 w-5 text-primary-orange" />
                  </span>
                  <div>
                    <p className="text-xs text-text/60">Location</p>
                    <p className="font-semibold">
                      {business.address}
                      {business.state && !business.address.includes(business.state) ? `, ${business.state}` : ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="rounded-2xl bg-card p-4 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-orange/10">
                  <Globe className="h-5 w-5 text-primary-orange" />
                </span>
                <div>
                  <p className="text-xs text-text/60">Website</p>
                  <p className="font-semibold">{business.website.replace(/^www\./, "")}</p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {joining && (
        <EnrollModal
          plan={joining}
          defaultName={userProfile?.full_name ?? ""}
          defaultPhone={(userProfile as { phone?: string } | null)?.phone ?? ""}
          onClose={() => setJoining(null)}
          onDone={() => {
            setJoining(null);
            load();
          }}
        />
      )}
      {paying && user && (
        <PaymentModal
          enrollment={paying.enrollment}
          userId={user.id}
          suggested={paying.suggested}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            load();
          }}
        />
      )}
    </div>
  );
}
