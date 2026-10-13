/**
 * Total Revenue and Expected Revenue, as the Dashboard's tiles count them.
 *
 * Total Revenue is goods that have left the godown: Shipped and Delivered.
 * Everything still in hand -- an enquiry, a confirmed order, one on the
 * packing table -- is Expected Revenue until it ships, and a cancelled order
 * is neither. The two tiles therefore add up to the whole live order book,
 * and each is broken into its stages so either can be checked by hand
 * against the Orders page.
 *
 * These lived inside Analytics until the tiles moved to the Dashboard's
 * overview; they are here so there is one definition, not two to keep in
 * step.
 */

export interface StageTotal {
  stage: string;
  amount: number;
  orders: number;
}

export const REVENUE_STAGES: { stage: string; statuses: string[] }[] = [
  { stage: "Delivered", statuses: ["delivered"] },
  { stage: "Shipped", statuses: ["shipped", "dispatched"] },
];
export const REVENUE_STATUSES = REVENUE_STAGES.flatMap((s) => s.statuses);

/**
 * Expected Revenue is every status that is neither revenue nor cancelled.
 * The named stages are the ones the Orders page uses; anything else (a legacy
 * "payment completed", or a status added later) still counts, under Other,
 * rather than silently dropping out of both tiles.
 */
export const EXPECTED_STAGES: { stage: string; statuses: string[] }[] = [
  { stage: "Enquiry Received", statuses: ["enquiry received"] },
  { stage: "Order Confirmed", statuses: ["order confirmed"] },
  { stage: "Packing", statuses: ["packing"] },
];
export const CANCELLED_STATUS = "cancelled";

/**
 * An order is a sale once it has been confirmed: that is the point stock is
 * committed and the business has agreed to supply it. "payment completed" is
 * the legacy spelling of a confirmed order and still counts.
 */
export const SALE_STATUSES = [
  "order confirmed",
  "packing",
  "shipped",
  "dispatched",
  "delivered",
  "payment completed",
];

export const statusOf = (order: any) => (order?.status || "").toString().toLowerCase();

/** What the customer pays: the order total less its discount. */
export const netAmount = (order: any) =>
  Math.max(Number(order?.total_amount || 0) - Number(order?.discount_amt || 0), 0);

function totalsByStage(
  orders: any[],
  stages: { stage: string; statuses: string[] }[]
): StageTotal[] {
  return stages.map(({ stage, statuses }) => {
    const inStage = orders.filter((o) => statuses.includes(statusOf(o)));
    return {
      stage,
      amount: inStage.reduce((s, o) => s + netAmount(o), 0),
      orders: inStage.length,
    };
  });
}

export interface RevenueSummary {
  totalRevenue: number;
  revenueByStage: StageTotal[];
  /** Money actually received against the shipped and delivered orders. */
  amountReceived: number;
  averageOrderValue: number;
  expectedRevenue: number;
  expectedByStage: StageTotal[];
}

export function revenueSummary(orders: any[]): RevenueSummary {
  const revenueOrders = orders.filter((o) => REVENUE_STATUSES.includes(statusOf(o)));
  const expectedOrders = orders.filter(
    (o) => statusOf(o) !== CANCELLED_STATUS && !REVENUE_STATUSES.includes(statusOf(o))
  );
  const sum = (list: any[]) => list.reduce((s, o) => s + netAmount(o), 0);

  const totalRevenue = sum(revenueOrders);
  const expectedRevenue = sum(expectedOrders);

  const namedExpected = totalsByStage(expectedOrders, EXPECTED_STAGES);
  const otherExpected = {
    stage: "Other",
    amount: expectedRevenue - namedExpected.reduce((s, t) => s + t.amount, 0),
    orders: expectedOrders.length - namedExpected.reduce((s, t) => s + t.orders, 0),
  };

  return {
    totalRevenue,
    revenueByStage: totalsByStage(revenueOrders, REVENUE_STAGES),
    amountReceived: revenueOrders.reduce((s, o) => s + Number(o.amount_received || 0), 0),
    averageOrderValue: revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0,
    expectedRevenue,
    expectedByStage: otherExpected.orders > 0 ? [...namedExpected, otherExpected] : namedExpected,
  };
}
