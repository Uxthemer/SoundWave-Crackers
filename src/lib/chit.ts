import { addMonths, format, isAfter, startOfDay, startOfMonth } from "date-fns";
import { supabase } from "./supabase";

/**
 * The chit scheme: plans, a member's enrolments and their payments
 * (migration 20261116020000_chit_scheme.sql), and the arithmetic both the
 * member's screen and the superadmin's read.
 *
 * Every write is a database function that checks who is calling; this file
 * only calls them and then asks `chit-notify` to tell whoever needs telling.
 */

export interface ChitPlan {
  id: string;
  name: string;
  description: string | null;
  monthly_amount: number;
  months: number;
  bonus_amount: number;
  total_paid: number;
  total_value: number;
  due_day: number;
  features: string[];
  max_members: number | null;
  is_active: boolean;
  display_order: number;
  /** "Diwali 2027". The dates below are the scheme's calendar, the 1st of each month. */
  season_label?: string | null;
  /** First installment month. */
  starts_on?: string | null;
  /** The month the scheme closes. */
  ends_on?: string | null;
  /** When crackers go to members who completed the scheme. */
  dispatch_on?: string | null;
}

export type EnrollmentStatus = "pending" | "active" | "completed" | "cancelled" | "rejected";
export type PaymentStatus = "pending" | "approved" | "rejected";

export interface ChitEnrollment {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  monthly_amount: number;
  months: number;
  bonus_amount: number;
  due_day: number;
  status: EnrollmentStatus;
  member_name: string;
  phone: string;
  email: string | null;
  start_month: string | null;
  user_note: string | null;
  admin_note: string | null;
  plan_history: {
    at: string;
    note: string | null;
    from: { name: string; monthly_amount: number; months: number };
    to: { name: string; monthly_amount: number; months: number };
  }[];
  approved_at: string | null;
  created_at: string;
}

export interface ChitPayment {
  id: string;
  enrollment_id: string;
  user_id: string;
  amount: number;
  approved_amount: number | null;
  method: string | null;
  transaction_ref: string | null;
  screenshot_path: string | null;
  paid_on: string;
  status: PaymentStatus;
  user_note: string | null;
  admin_note: string | null;
  recorded_by_admin: boolean;
  reviewed_at: string | null;
  created_at: string;
}

/** The ways people pay, for the chips on the payment form. */
export const PAYMENT_METHODS = ["GPay", "PhonePe", "Paytm", "BHIM / UPI", "Bank transfer", "Cash", "Other"];

const numeric = <T extends Record<string, any>>(row: T, keys: (keyof T)[]): T => {
  const copy = { ...row };
  keys.forEach((k) => {
    if (copy[k] !== null && copy[k] !== undefined) (copy as any)[k] = Number(copy[k]);
  });
  return copy;
};

const asPlan = (row: any): ChitPlan =>
  numeric(row, ["monthly_amount", "bonus_amount", "total_paid", "total_value"]);
const asEnrollment = (row: any): ChitEnrollment =>
  numeric({ ...row, plan_history: row.plan_history ?? [] }, ["monthly_amount", "bonus_amount"]);
const asPayment = (row: any): ChitPayment => numeric(row, ["amount", "approved_amount"]);

// ---- reads ----------------------------------------------------------------

export async function fetchChitPlans(includeInactive = false): Promise<ChitPlan[]> {
  let query = supabase
    .from("chit_plans")
    .select("*")
    .order("display_order")
    .order("monthly_amount");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(asPlan);
}

/** Members per plan, pending and active, for "seats left". */
export async function fetchPlanMembers(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("chit_plan_members");
  if (error) throw error;
  return Object.fromEntries(((data as any[]) ?? []).map((r) => [r.plan_id, Number(r.members)]));
}

/** Enrolments with their payments. RLS limits a member to their own. */
export async function fetchEnrollments(userId?: string): Promise<
  (ChitEnrollment & { payments: ChitPayment[] })[]
> {
  let query = supabase
    .from("chit_enrollments")
    .select("*, payments:chit_payments(*)")
    .order("created_at", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...asEnrollment(row),
    payments: (row.payments ?? [])
      .map(asPayment)
      .sort((a: ChitPayment, b: ChitPayment) => b.created_at.localeCompare(a.created_at)),
  }));
}

// ---- writes ---------------------------------------------------------------

/** Tells whoever needs telling. A failure never undoes the action it follows. */
async function notifyChit(
  event: "enrollment_requested" | "payment_submitted" | "enrollment_reviewed" | "payment_reviewed",
  id: string
) {
  try {
    const { error } = await supabase.functions.invoke("chit-notify", { body: { event, id } });
    if (error) console.warn("chit-notify:", error);
  } catch (error) {
    console.warn("chit-notify failed:", error);
  }
}

export async function enrollInPlan(planId: string, memberName: string, phone: string, note: string) {
  const { data, error } = await supabase.rpc("chit_enroll", {
    p_plan_id: planId,
    p_member_name: memberName,
    p_phone: phone,
    p_note: note || null,
  });
  if (error) throw error;
  const row = asEnrollment(data);
  void notifyChit("enrollment_requested", row.id);
  return row;
}

/**
 * Shrinks a phone screenshot before upload: the longest side to 1600px, as a
 * JPEG. A transaction screen stays perfectly readable and a 6 MB PNG becomes
 * a few hundred KB, which matters on a mobile connection.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image of the payment.");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob ?? file;
  } catch {
    // An image the browser cannot decode (HEIC on some phones) goes as it is.
    return file;
  }
}

export async function submitPayment(input: {
  enrollmentId: string;
  userId: string;
  amount: number;
  method: string;
  transactionRef: string;
  paidOn: string;
  note: string;
  screenshot: File;
}) {
  const image = await shrinkImage(input.screenshot);
  const extension = image.type === "image/jpeg" ? "jpg" : input.screenshot.name.split(".").pop() || "jpg";
  const path = `${input.userId}/${input.enrollmentId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("chit-payments")
    .upload(path, image, { contentType: image.type || "image/jpeg" });
  if (uploadError) throw new Error(`The screenshot could not be uploaded: ${uploadError.message}`);

  const { data, error } = await supabase.rpc("chit_submit_payment", {
    p_enrollment_id: input.enrollmentId,
    p_amount: input.amount,
    p_method: input.method,
    p_transaction_ref: input.transactionRef,
    p_screenshot_path: path,
    p_paid_on: input.paidOn,
    p_note: input.note || null,
  });
  if (error) {
    // Nothing points at the file now; take it back out.
    await supabase.storage.from("chit-payments").remove([path]);
    throw error;
  }
  const row = asPayment(data);
  void notifyChit("payment_submitted", row.id);
  return row;
}

/** A short-lived link to a payment screenshot, for the member or a superadmin. */
export async function screenshotUrl(path: string) {
  const { data, error } = await supabase.storage.from("chit-payments").createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewEnrollment(id: string, approve: boolean, startMonth: string | null, note: string) {
  const { data, error } = await supabase.rpc("chit_review_enrollment", {
    p_enrollment_id: id,
    p_approve: approve,
    p_start_month: startMonth,
    p_note: note || null,
  });
  if (error) throw error;
  void notifyChit("enrollment_reviewed", id);
  return asEnrollment(data);
}

export async function reviewPayment(id: string, approve: boolean, approvedAmount: number | null, note: string) {
  const { data, error } = await supabase.rpc("chit_review_payment", {
    p_payment_id: id,
    p_approve: approve,
    p_approved_amount: approvedAmount,
    p_note: note || null,
  });
  if (error) throw error;
  void notifyChit("payment_reviewed", id);
  return asPayment(data);
}

export async function recordPayment(input: {
  enrollmentId: string;
  amount: number;
  method: string;
  transactionRef: string;
  paidOn: string;
  note: string;
}) {
  const { data, error } = await supabase.rpc("chit_record_payment", {
    p_enrollment_id: input.enrollmentId,
    p_amount: input.amount,
    p_method: input.method || null,
    p_transaction_ref: input.transactionRef || null,
    p_paid_on: input.paidOn,
    p_note: input.note || null,
  });
  if (error) throw error;
  const row = asPayment(data);
  // The member hears about it like any approved payment.
  void notifyChit("payment_reviewed", row.id);
  return row;
}

export async function changePlan(enrollmentId: string, planId: string, note: string) {
  const { data, error } = await supabase.rpc("chit_change_plan", {
    p_enrollment_id: enrollmentId,
    p_plan_id: planId,
    p_note: note || null,
  });
  if (error) throw error;
  return asEnrollment(data);
}

export async function setEnrollmentStatus(id: string, status: "active" | "completed" | "cancelled", note: string) {
  const { data, error } = await supabase.rpc("chit_set_enrollment_status", {
    p_enrollment_id: id,
    p_status: status,
    p_note: note || null,
  });
  if (error) throw error;
  return asEnrollment(data);
}

export async function savePlan(plan: Partial<ChitPlan> & { id?: string }) {
  const row = {
    name: plan.name?.trim(),
    description: plan.description?.trim() || null,
    monthly_amount: plan.monthly_amount,
    months: plan.months,
    bonus_amount: plan.bonus_amount ?? 0,
    due_day: plan.due_day ?? 10,
    features: (plan.features ?? []).map((f) => f.trim()).filter(Boolean),
    max_members: plan.max_members || null,
    is_active: plan.is_active ?? true,
    display_order: plan.display_order ?? 0,
    season_label: plan.season_label?.trim() || null,
    starts_on: plan.starts_on || null,
    ends_on: plan.ends_on || null,
    dispatch_on: plan.dispatch_on || null,
  };
  const { error } = plan.id
    ? await supabase.from("chit_plans").update(row).eq("id", plan.id)
    : await supabase.from("chit_plans").insert(row);
  if (error) throw error;
}

/**
 * Deletes a member's chit and every payment on it (superadmin only), then the
 * payment screenshots the database handed back. A screenshot that will not
 * delete is only an orphaned file; the chit is gone either way, so that is
 * logged rather than reported as a failure.
 */
export async function deleteEnrollment(id: string) {
  const { data, error } = await supabase.rpc("chit_delete_enrollment", { p_enrollment_id: id });
  if (error) throw error;
  const paths = ((data as string[] | null) ?? []).filter(Boolean);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from("chit-payments").remove(paths);
    if (removeError) console.warn("Chit screenshots left in storage:", removeError);
  }
}

/** Opens or closes a plan to new members. Members already on it are unaffected. */
export async function setPlanActive(id: string, active: boolean) {
  const { error } = await supabase.from("chit_plans").update({ is_active: active }).eq("id", id);
  if (error) throw error;
}

/**
 * Deletes a plan nobody has ever joined. Enrolments reference their plan and
 * the reference does not cascade, so the database refuses to delete a plan
 * with members -- past ones included, whose history points at it. The screen
 * checks first and explains; this turns the database's refusal into the same
 * sentence if the screen's count was out of date.
 */
export async function deletePlan(id: string) {
  const { error } = await supabase.from("chit_plans").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("This plan has members, so it cannot be deleted. Make it inactive instead.");
    }
    throw error;
  }
}

// ---- the schedule ---------------------------------------------------------

export type MonthState = "paid" | "partial" | "submitted" | "overdue" | "due" | "upcoming";

export interface ScheduleMonth {
  index: number;
  month: Date;
  dueDate: Date;
  /** Approved money counted against this month. */
  paid: number;
  state: MonthState;
}

export interface ChitSummary {
  target: number;
  /** Approved money: what counts. */
  paid: number;
  /** Submitted, waiting for approval. */
  awaiting: number;
  balance: number;
  /** Paid beyond the target, after a switch to a smaller plan, say. */
  extra: number;
  monthsPaid: number;
  /** What should have been paid by today and has not, approved money only. */
  dueNow: number;
  overdueMonths: number;
  next: ScheduleMonth | null;
  schedule: ScheduleMonth[];
  /** False until the enrolment is approved: the months are a projection. */
  scheduled: boolean;
  progress: number;
}

/**
 * Month by month, from the money approved so far. Approved money fills the
 * months in order, so neither the member nor the superadmin has to say which
 * month a payment was for: a double payment covers two, and after a switch to
 * a bigger plan the same money simply covers fewer months.
 */
export function chitSummary(
  enrollment: Pick<ChitEnrollment, "monthly_amount" | "months" | "due_day" | "start_month" | "created_at">,
  payments: Pick<ChitPayment, "status" | "amount" | "approved_amount">[],
  today = new Date()
): ChitSummary {
  const monthly = Number(enrollment.monthly_amount);
  const target = monthly * enrollment.months;
  const paid = payments
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.approved_amount ?? p.amount ?? 0), 0);
  const awaiting = payments
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const start = startOfMonth(
    enrollment.start_month ? new Date(enrollment.start_month) : new Date(enrollment.created_at)
  );
  const day = startOfDay(today);
  const schedule: ScheduleMonth[] = Array.from({ length: enrollment.months }, (_, index) => {
    const month = addMonths(start, index);
    const dueDate = new Date(month.getFullYear(), month.getMonth(), enrollment.due_day);
    const covered = Math.min(Math.max(paid - index * monthly, 0), monthly);
    const pendingCovers = paid + awaiting - index * monthly > 0.005;
    let state: MonthState;
    if (covered >= monthly - 0.005) state = "paid";
    else if (covered > 0.005) state = "partial";
    else if (pendingCovers) state = "submitted";
    else if (isAfter(day, dueDate)) state = "overdue";
    else if (month.getFullYear() === day.getFullYear() && month.getMonth() === day.getMonth()) state = "due";
    else state = "upcoming";
    return { index, month, dueDate, paid: covered, state };
  });

  const dueByToday = schedule.filter((m) => !isAfter(m.month, day)).length * monthly;
  return {
    target,
    paid,
    awaiting,
    balance: Math.max(target - paid, 0),
    extra: Math.max(paid - target, 0),
    monthsPaid: schedule.filter((m) => m.state === "paid").length,
    dueNow: Math.max(Math.min(dueByToday, target) - paid, 0),
    overdueMonths: schedule.filter((m) => m.state === "overdue").length,
    next: schedule.find((m) => m.state !== "paid") ?? null,
    schedule,
    scheduled: Boolean(enrollment.start_month),
    progress: target > 0 ? Math.min(paid / target, 1) : 0,
  };
}

export const rupees = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export const monthLabel = (date: Date) => format(date, "MMM yyyy");

/** A plan date ("2026-12-01") as "Dec 2026", or null. */
export const planMonth = (value: string | null | undefined) =>
  value ? format(new Date(`${value}T00:00:00`), "MMM yyyy") : null;

/**
 * When the bonus is a whole number of installments -- the shop paying the
 * 10th month of a 9-month plan -- the month it stands for, else null. That is
 * how the offer is put to customers, so the card says it that way.
 */
export function bonusMonth(plan: Pick<ChitPlan, "monthly_amount" | "months" | "bonus_amount">) {
  if (!(plan.monthly_amount > 0) || !(plan.bonus_amount > 0)) return null;
  const count = plan.bonus_amount / plan.monthly_amount;
  if (Math.abs(count - Math.round(count)) > 0.001 || Math.round(count) !== 1) return null;
  return plan.months + 1;
}

/** "10th", "1st", "22nd". */
export const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** Plain-language errors from the database functions, for a toast. */
export const chitError = (error: unknown) =>
  (error as { message?: string } | null)?.message || "Something went wrong. Please try again.";
