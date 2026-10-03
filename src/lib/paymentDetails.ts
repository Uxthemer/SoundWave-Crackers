/**
 * The UPI ID customers pay to, written down once.
 *
 * It is shown and copied on the order confirmation (Cart.tsx) and on the
 * Pay Now page (Payment.tsx). It used to be a separate constant in each, so
 * changing account meant finding both.
 *
 * The QR code beside it is a picture, public/assets/img/payment/
 * QR-Code-payment.jpg, and encodes its own UPI ID. Changing this constant
 * does not change the QR: replace that image with one for the same account.
 */
export const UPI_ID = "selvakumar27794@okhdfcbank";
