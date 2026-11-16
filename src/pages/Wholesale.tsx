import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BadgePercent,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Factory,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  Send,
  Truck,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { businessFromSettings } from "../lib/businessDetails";
import { usePageMeta } from "../lib/seo";
import { useStatesAndDistricts } from "../hooks/useStatesAndDistricts";
import {
  BUDGETS,
  BUSINESS_TYPES,
  CONTACT_PREFERENCES,
  ENQUIRY_TYPES,
  submitWholesaleEnquiry,
  wholesaleError,
  type EnquiryType,
  type WholesaleEnquiryInput,
} from "../lib/wholesale";

const field =
  "w-full px-3 py-2.5 rounded-xl bg-background border border-card-border/20 focus:outline-none focus:border-primary-orange text-base sm:text-sm";

/** `?type=price-list` (the menu's "Wholesale price list") picks that enquiry. */
const typeFromQuery = (value: string | null): EnquiryType =>
  value === "price-list" || value === "price_list"
    ? "price_list"
    : value === "dealership"
      ? "dealership"
      : "bulk_order";

const FAQ = [
  [
    "Who can buy wholesale?",
    "Retail shops, resellers and distributors, temples and festival committees, companies buying for gifting, event organisers, and anyone ordering in bulk.",
  ],
  [
    "How do I get the wholesale price list?",
    "Choose \"Wholesale price list\" in the form below and send it. We'll share the current list with you on your preferred contact — phone, WhatsApp or email.",
  ],
  [
    "Is there a minimum order?",
    "Wholesale rates apply to bulk orders. The minimum and the slab-wise rates are shared along with the price list.",
  ],
  [
    "Do you deliver outside Tamil Nadu?",
    "Yes. Orders are sent by transport across India, and you receive the LR number to track the consignment.",
  ],
  [
    "How do I pay?",
    "We confirm the order and the amount with you first. Payment is by UPI or bank transfer.",
  ],
];

/**
 * Wholesale, for the public: why buy from us in bulk, and an enquiry form.
 * For now everything is an enquiry -- the price list included -- answered by
 * a person; superadmins see each one in Dashboard → Wholesale and are told of
 * it at once (lib/wholesale.ts).
 */
export function Wholesale() {
  const { userProfile } = useAuth();
  const { settings } = useAppSettings();
  const business = businessFromSettings(settings);
  const [searchParams] = useSearchParams();
  const formRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const [form, setForm] = useState<WholesaleEnquiryInput>(() => ({
    enquiry_type: typeFromQuery(searchParams.get("type")),
    business_name: "",
    contact_name: userProfile?.full_name ?? "",
    phone: (userProfile as { phone?: string } | null)?.phone ?? "",
    alternate_phone: "",
    email: (userProfile as { email?: string } | null)?.email ?? "",
    business_type: "",
    gstin: "",
    city: "",
    district: "",
    state: "Tamil Nadu",
    pincode: "",
    budget: "",
    products: "",
    message: "",
    preferred_contact: "WhatsApp",
  }));
  const set = <K extends keyof WholesaleEnquiryInput>(key: K, value: WholesaleEnquiryInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { states, districts } = useStatesAndDistricts(form.state);

  usePageMeta({
    title: "Wholesale Crackers from Sivakasi — Bulk Orders & Price List | SoundWave Crackers",
    description:
      "Buy crackers wholesale direct from Sivakasi. Request our wholesale price list or a bulk order quote for shops, resellers, temples, events and corporate gifting.",
  });

  // A profile that loads after the page fills the contact fields, unless typed in.
  useEffect(() => {
    if (!userProfile) return;
    setForm((f) => ({
      ...f,
      contact_name: f.contact_name || userProfile.full_name || "",
      phone: f.phone || (userProfile as { phone?: string }).phone || "",
      email: f.email || (userProfile as { email?: string }).email || "",
    }));
  }, [userProfile]);

  // Arriving for the price list goes straight to the form.
  useEffect(() => {
    const type = searchParams.get("type");
    if (type) {
      setForm((f) => ({ ...f, enquiry_type: typeFromQuery(type) }));
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, [searchParams]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contact_name.trim()) return toast.error("Please enter your name.");
    if (form.phone.replace(/\D/g, "").length < 10) return toast.error("Please enter a valid 10-digit phone number.");
    setSaving(true);
    try {
      await submitWholesaleEnquiry(form);
      setSubmitted(true);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      toast.error(wholesaleError(error));
    } finally {
      setSaving(false);
    }
  };

  const phones = business.phone.split(",").map((p) => p.trim()).filter(Boolean);
  const whatsapp = phones[0]?.replace(/\D/g, "").slice(-10);

  const label = (text: string, required = false) => (
    <span className="block text-xs font-medium text-text/60 mb-1">
      {text}
      {required && <span className="text-primary-red"> *</span>}
    </span>
  );

  return (
    <div className="min-h-screen pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e2a4a] via-[#2b1d4a] to-[#4a1d2a] text-white">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,#ff5722_0,transparent_40%),radial-gradient(circle_at_80%_60%,#ffc107_0,transparent_35%)]" />
        <div className="relative container mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 grid gap-8 lg:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">
              <Factory className="w-3.5 h-3.5" /> Direct from Sivakasi
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl mt-4 leading-tight">
              Wholesale crackers <span className="text-primary-yellow">for your business</span>
            </h1>
            <p className="mt-4 text-white/80 max-w-xl">
              Shops, resellers, temples, events and corporate gifting — get our wholesale price list or a
              quote for your bulk order. Tell us what you need and we'll get back to you.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  set("enquiry_type", "price_list");
                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center gap-2 rounded-xl bg-primary-orange px-5 py-3 font-semibold hover:bg-primary-orange/90"
              >
                <FileText className="w-4 h-4" /> Get wholesale price list
              </button>
              <button
                onClick={() => {
                  set("enquiry_type", "bulk_order");
                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center gap-2 rounded-xl border border-white/40 px-5 py-3 font-semibold hover:bg-white/10"
              >
                <ClipboardList className="w-4 h-4" /> Request a bulk quote
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              [Factory, "Factory-direct", "Straight from Sivakasi"],
              [BadgePercent, "Bulk rates", "Better prices as you buy more"],
              [Truck, "Across India", "Transport with LR tracking"],
              [Building2, "For business", "GSTIN welcome on enquiries"],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Factory;
              return (
                <div key={title as string} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <I className="w-6 h-6 text-primary-yellow" />
                  <p className="mt-2 font-semibold">{title as string}</p>
                  <p className="text-xs text-white/70">{text as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        {/* Who it's for */}
        <section className="mt-10 text-center">
          <h2 className="font-heading text-2xl sm:text-3xl">Who we supply</h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {BUSINESS_TYPES.filter((t) => t !== "Other").map((t) => (
              <span key={t} className="rounded-full bg-card px-4 py-2 text-sm">
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Send your enquiry", "Ask for the price list, or share your list and budget."],
            ["2", "We call you back", "On your preferred contact, with rates and a quote."],
            ["3", "Confirm & dispatch", "Pay by UPI or bank transfer; we send it with the LR number."],
          ].map(([n, title, text]) => (
            <div key={n} className="rounded-2xl bg-card p-5 flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-orange text-white font-bold">
                {n}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-text/60">{text}</p>
              </div>
            </div>
          ))}
        </section>

        {/* The form, with how to reach us beside it */}
        <section ref={formRef} className="mt-12 scroll-mt-24 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl bg-card p-5 sm:p-7">
            {submitted ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto w-14 h-14 text-green-600" />
                <h2 className="font-heading text-3xl mt-4">Thank you!</h2>
                <p className="mt-2 text-text/70 max-w-md mx-auto">
                  We've received your enquiry
                  {form.enquiry_type === "price_list" ? " for the wholesale price list" : ""}. Our team will contact
                  you on your {form.preferred_contact.toLowerCase()} soon.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setForm((f) => ({ ...f, products: "", message: "" }));
                  }}
                  className="mt-6 rounded-xl border border-card-border/30 px-5 py-2.5 font-semibold hover:bg-background/60"
                >
                  Send another enquiry
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                <div>
                  <h2 className="font-heading text-2xl sm:text-3xl">Wholesale enquiry</h2>
                  <p className="text-sm text-text/60">Fields marked * are needed; the rest help us answer faster.</p>
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold mb-2">What do you need?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {ENQUIRY_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() => set("enquiry_type", t.value)}
                        aria-pressed={form.enquiry_type === t.value}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          form.enquiry_type === t.value
                            ? "border-primary-orange bg-primary-orange/10"
                            : "border-card-border/20 hover:bg-background/60"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{t.label}</span>
                        <span className="block text-xs text-text/60">{t.hint}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="text-sm font-semibold mb-2 sm:col-span-2">About you</legend>
                  <label>
                    {label("Your name", true)}
                    <input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={field} autoComplete="name" />
                  </label>
                  <label>
                    {label("Phone", true)}
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={field} inputMode="tel" autoComplete="tel" />
                  </label>
                  <label>
                    {label("Alternate phone")}
                    <input value={form.alternate_phone} onChange={(e) => set("alternate_phone", e.target.value)} className={field} inputMode="tel" />
                  </label>
                  <label>
                    {label("Email")}
                    <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={field} inputMode="email" autoComplete="email" />
                  </label>
                  <div className="sm:col-span-2">
                    {label("Best way to reach you")}
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_PREFERENCES.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => set("preferred_contact", c)}
                          className={`rounded-full border px-3 py-1.5 text-sm ${
                            form.preferred_contact === c
                              ? "border-primary-orange bg-primary-orange text-white"
                              : "border-card-border/20 bg-background"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </fieldset>

                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="text-sm font-semibold mb-2 sm:col-span-2">Your business</legend>
                  <label>
                    {label("Business / shop name")}
                    <input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} className={field} autoComplete="organization" />
                  </label>
                  <label>
                    {label("Type of business")}
                    <select value={form.business_type} onChange={(e) => set("business_type", e.target.value)} className={field}>
                      <option value="">Choose…</option>
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    {label("GSTIN (optional)")}
                    <input value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} className={`${field} font-mono`} maxLength={15} />
                  </label>
                </fieldset>

                <fieldset className="grid gap-3 grid-cols-2">
                  <legend className="text-sm font-semibold mb-2 col-span-2">Delivery location</legend>
                  <label>
                    {label("State")}
                    <select value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value, district: "" }))} className={field}>
                      <option value="">Choose…</option>
                      {states.map((s) => (
                        <option key={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {label("District")}
                    <select value={form.district} onChange={(e) => set("district", e.target.value)} className={field} disabled={!form.state}>
                      <option value="">Choose…</option>
                      {districts.map((d) => (
                        <option key={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {label("City / town")}
                    <input value={form.city} onChange={(e) => set("city", e.target.value)} className={field} />
                  </label>
                  <label>
                    {label("PIN code")}
                    <input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} className={field} inputMode="numeric" maxLength={6} />
                  </label>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold mb-2">Your requirement</legend>
                  <div>
                    {label("Approximate budget")}
                    <div className="flex flex-wrap gap-2">
                      {BUDGETS.map((b) => (
                        <button
                          type="button"
                          key={b}
                          onClick={() => set("budget", form.budget === b ? "" : b)}
                          className={`rounded-full border px-3 py-1.5 text-sm ${
                            form.budget === b
                              ? "border-primary-orange bg-primary-orange text-white"
                              : "border-card-border/20 bg-background"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    {label("Products or categories you need")}
                    <textarea
                      value={form.products}
                      onChange={(e) => set("products", e.target.value)}
                      rows={3}
                      placeholder="e.g. Sparklers 200 boxes, flower pots, 1000 wala…"
                      className={field}
                    />
                  </label>
                  <label className="block">
                    {label("Anything else")}
                    <textarea
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      rows={3}
                      placeholder="Delivery date, questions, special requests"
                      className={field}
                    />
                  </label>
                </fieldset>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-orange py-3.5 font-semibold text-white hover:bg-primary-orange/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {saving ? "Sending…" : form.enquiry_type === "price_list" ? "Request the price list" : "Send enquiry"}
                </button>
              </form>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-28 self-start">
            <div className="rounded-2xl bg-card p-5">
              <p className="font-semibold">Prefer to talk?</p>
              <p className="text-sm text-text/60 mb-3">Call or WhatsApp our wholesale desk.</p>
              <div className="space-y-2">
                {phones.map((p) => (
                  <a key={p} href={`tel:${p.replace(/\s+/g, "")}`} className="flex items-center gap-2 font-semibold hover:text-primary-orange">
                    <Phone className="w-4 h-4 text-primary-orange" /> {p}
                  </a>
                ))}
                {whatsapp && (
                  <a
                    href={`https://wa.me/91${whatsapp}?text=${encodeURIComponent("Hi, I'd like your wholesale price list.")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 font-semibold text-white hover:bg-green-700"
                  >
                    <FaWhatsapp className="w-5 h-5" /> Chat on WhatsApp
                  </a>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-card p-5 text-sm text-text/70 flex gap-3">
              <MessageCircle className="w-5 h-5 text-primary-orange shrink-0" />
              <p>
                {business.name}
                {business.address ? `, ${business.address}` : ""}
                {business.state ? `, ${business.state}` : ""}. {business.email}
              </p>
            </div>
          </aside>
        </section>

        {/* FAQ */}
        <section className="mt-12 max-w-3xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl text-center mb-4">Questions</h2>
          <div className="rounded-2xl bg-card divide-y divide-card-border/10">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left font-semibold"
                >
                  {q}
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && <p className="px-4 pb-4 text-sm text-text/70">{a}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
