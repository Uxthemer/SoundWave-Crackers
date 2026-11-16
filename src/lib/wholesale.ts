import { supabase } from "./supabase";

/**
 * Wholesale enquiries (migration 20261116050000_wholesale_enquiries.sql): the
 * public form's submission, and the superadmin's list in Dashboard →
 * Wholesale. A submission goes through `submit_wholesale_enquiry`, which
 * checks and trims it; then `wholesale-notify` tells the superadmins, once.
 */

export type EnquiryType = "price_list" | "bulk_order" | "dealership" | "other";
export type EnquiryStatus = "new" | "contacted" | "quoted" | "converted" | "closed";

export const ENQUIRY_TYPES: { value: EnquiryType; label: string; hint: string }[] = [
  { value: "price_list", label: "Wholesale price list", hint: "Get our latest wholesale rates" },
  { value: "bulk_order", label: "Bulk order quote", hint: "A quote for a specific list" },
  { value: "dealership", label: "Dealership / resale", hint: "Stock our crackers in your shop" },
  { value: "other", label: "Something else", hint: "Events, gifting, anything else" },
];

export const BUSINESS_TYPES = [
  "Retail shop",
  "Reseller / distributor",
  "Temple / festival committee",
  "Corporate gifting",
  "Event organiser",
  "Individual (bulk)",
  "Other",
];

export const BUDGETS = ["Under ₹25,000", "₹25,000 – ₹50,000", "₹50,000 – ₹1 lakh", "₹1 – 5 lakh", "Above ₹5 lakh"];

export const CONTACT_PREFERENCES = ["Phone call", "WhatsApp", "Email"];

export const STATUS_LABEL: Record<EnquiryStatus, [string, string]> = {
  new: ["New", "bg-red-100 text-red-700"],
  contacted: ["Contacted", "bg-blue-100 text-blue-700"],
  quoted: ["Quoted", "bg-amber-100 text-amber-800"],
  converted: ["Converted", "bg-green-100 text-green-700"],
  closed: ["Closed", "bg-gray-200 text-gray-600"],
};

export const typeLabel = (type: string) => ENQUIRY_TYPES.find((t) => t.value === type)?.label ?? type;

export interface WholesaleEnquiryInput {
  enquiry_type: EnquiryType;
  business_name: string;
  contact_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  business_type: string;
  gstin: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  budget: string;
  products: string;
  message: string;
  preferred_contact: string;
}

export interface WholesaleEnquiry extends WholesaleEnquiryInput {
  id: string;
  status: EnquiryStatus;
  admin_note: string | null;
  user_id: string | null;
  notified_at: string | null;
  status_changed_at: string | null;
  created_at: string;
}

export async function submitWholesaleEnquiry(input: WholesaleEnquiryInput) {
  const { data, error } = await supabase.rpc("submit_wholesale_enquiry", { p_enquiry: input });
  if (error) throw error;
  const id = data as string;
  // The enquiry is in; a failed alert must not tell the visitor it failed.
  supabase.functions
    .invoke("wholesale-notify", { body: { id } })
    .then(({ error: notifyError }) => notifyError && console.warn("wholesale-notify:", notifyError))
    .catch((e) => console.warn("wholesale-notify failed:", e));
  return id;
}

export async function fetchWholesaleEnquiries(): Promise<WholesaleEnquiry[]> {
  const { data, error } = await supabase
    .from("wholesale_enquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WholesaleEnquiry[];
}

export async function updateWholesaleEnquiry(id: string, patch: { status?: EnquiryStatus; admin_note?: string | null }) {
  const { error } = await supabase.from("wholesale_enquiries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteWholesaleEnquiry(id: string) {
  const { error } = await supabase.from("wholesale_enquiries").delete().eq("id", id);
  if (error) throw error;
}

export const wholesaleError = (error: unknown) =>
  (error as { message?: string } | null)?.message || "Something went wrong. Please try again.";
