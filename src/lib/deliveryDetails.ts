import type { DeliveryDetailsState } from "../store/cartStore";

/**
 * The cart's shipping details, cleaned and checked before anything is saved.
 *
 * What staff and customers type arrives with stray spaces -- pasted from
 * WhatsApp, autofilled, or a name typed with two spaces in it. Saved as is,
 * " 9789794518" does not match the customer lookup, "Chennai " is a second
 * city in every report, and a field of nothing but spaces passes as filled
 * in. So every field is trimmed, and the order and the quotation are both
 * checked against the cleaned values, never the raw ones.
 */

/** Runs of whitespace inside free text become one space. */
const tidy = (value: string | null | undefined) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * A phone as the ten digits the rest of the app matches on.
 *
 * "+91 97897 94518", "097897-94518" and "9789794518" are one number; only
 * the separators and the country or trunk prefix differ. Anything that does
 * not reduce to ten digits is left as typed, so validation can say so rather
 * than this quietly mangling it.
 */
export function cleanPhone(value: string | null | undefined): string {
  const typed = String(value ?? "").trim();
  if (!typed) return "";
  const digits = typed.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return typed;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function cleanDelivery(delivery: DeliveryDetailsState): DeliveryDetailsState {
  return {
    ...delivery,
    customerName: tidy(delivery.customerName),
    // Only the spacing is touched: capitalisation in a name or an address
    // is the customer's, and is printed as they gave it.
    address: tidy(delivery.address),
    city: tidy(delivery.city),
    state: tidy(delivery.state),
    district: tidy(delivery.district),
    country: tidy(delivery.country) || "India",
    email: tidy(delivery.email).toLowerCase(),
    phone: cleanPhone(delivery.phone),
    alternatePhone: cleanPhone(delivery.alternatePhone),
    referralPhone: cleanPhone(delivery.referralPhone),
    pincode: String(delivery.pincode ?? "").replace(/\s+/g, ""),
  };
}

const PHONE = /^[6-9]\d{9}$/;
const PINCODE = /^[1-9][0-9]{5}$/;
// Deliberately loose: one @, something either side, a dot in the domain.
// The aim is to catch a typo, not to rule on what an address may be.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The first problem with cleaned details, in plain words, or null.
 *
 * An order needs everything the courier and the invoice need. A quotation
 * needs only who it is for -- but whatever else was typed must still be
 * right, since it is printed on the quotation. "edit" is an order already
 * placed, corrected from the admin popups: it is held to the quotation's
 * rule, because an older order may predate a field (district, email) that
 * the popup does not even offer, and fixing its phone must not be blocked
 * on that.
 */
export function deliveryProblem(
  delivery: DeliveryDetailsState,
  purpose: "order" | "quotation" | "edit"
): string | null {
  const required: [keyof DeliveryDetailsState, string][] =
    purpose === "order"
      ? [
          ["customerName", "name"],
          ["email", "email"],
          ["phone", "phone number"],
          ["address", "address"],
          ["state", "state"],
          ["district", "district"],
          ["city", "city"],
          ["pincode", "pincode"],
        ]
      : [
          ["customerName", "name"],
          ["phone", "phone number"],
        ];
  const missing = required.filter(([key]) => !delivery[key]).map(([, label]) => label);
  if (missing.length) {
    return purpose === "order" && missing.length > 1
      ? "Please fill all mandatory fields"
      : `Please enter the customer's ${missing.join(" and ")}`;
  }

  if (delivery.customerName.length < 2) {
    return "Please enter the customer's full name";
  }
  if (!PHONE.test(delivery.phone)) {
    return "Please enter a valid 10-digit phone number";
  }
  if (delivery.alternatePhone && !PHONE.test(delivery.alternatePhone)) {
    return "Please enter a valid 10-digit alternate phone number";
  }
  if (delivery.referralPhone && !PHONE.test(delivery.referralPhone)) {
    return "Please enter a valid 10-digit referral phone number";
  }
  if (delivery.email && !EMAIL.test(delivery.email)) {
    return "Please enter a valid email address";
  }
  if (delivery.pincode && !PINCODE.test(delivery.pincode)) {
    return "Please enter a valid 6-digit pincode";
  }
  return null;
}
