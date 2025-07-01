export const EXPENSE_TYPE_COLORS = {
  spend: {
    bg: "rgba(239,68,68,0.7)",      // red-500
    border: "rgba(239,68,68,1)",
    tailwind: "bg-primary-red/20 text-primary-red",
    label: "Spend",
  },
  credit: {
    bg: "rgba(34,197,94,0.7)",      // green-500
    border: "rgba(34,197,94,1)",
    tailwind: "bg-green-500/20 text-green-600",
    label: "Credit",
  },
  purchase: {
    bg: "rgba(59,130,246,0.7)",     // blue-500
    border: "rgba(59,130,246,1)",
    tailwind: "bg-blue-500/20 text-blue-600",
    label: "Purchase",
  },
  rent: {
    bg: "rgba(245,158,11,0.7)",     // amber-500
    border: "rgba(245,158,11,1)",
    tailwind: "bg-amber-500/20 text-amber-600",
    label: "Rent",
  },
};

export const EXPENSE_TYPE_ORDER = ["spend", "credit", "purchase", "rent"];