import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Download, Plus, Trash2, Edit2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { Bar } from "react-chartjs-2";
import { Chart, BarElement, CategoryScale, LinearScale, Legend, Tooltip } from "chart.js";
import { Pie } from "react-chartjs-2";
import { EXPENSE_TYPE_COLORS, EXPENSE_TYPE_ORDER } from "../config/chartConfig";
import { useAuth } from "../context/AuthContext";

interface Expense {
  id: string;
  date: string;
  details: string;
  spend_by: string;
  amount: number;
  reason: string;
  type: "credit" | "spend" | "purchase" | "rent"; // Added "rent"
  created_at: string;
  image_path?: string | null;
}

Chart.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);

export function Expenses() {
  const { userRole } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Omit<Expense, "id" | "created_at"> & { image?: string | null }>({
    date: "",
    details: "",
    spend_by: "",
    amount: 0,
    reason: "",
    type: "spend",
    image: null,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "spend" | "credit" | "purchase" | "rent">("all");
  const [sortField, setSortField] = useState<"date" | "amount" | "spend_by">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch expenses
  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("date", { ascending: false });
    if (!error && data) setExpenses(data as Expense[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  // Upload helper - stores file in Supabase storage 'expenses' bucket and returns public url + path
  async function uploadDocument(file: File): Promise<{ publicUrl: string | null; path: string | null }> {
    try {
      const id = (crypto && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}`);
      const filename = `${id}_${file.name.replace(/\s+/g, "_")}`;
      const path = `expenses/${filename}`;
      const { error: uploadError } = await supabase.storage.from("expenses").upload(path, file, { upsert: true });
      if (uploadError) {
        console.error("Upload error", uploadError);
        toast.error("File upload failed");
        return { publicUrl: null, path: null };
      }
      const { data: urlData } = supabase.storage.from("expenses").getPublicUrl(path);
      return { publicUrl: urlData.publicUrl || null, path };
    } catch (err) {
      console.error(err);
      toast.error("File upload failed");
      return { publicUrl: null, path: null };
    }
  }

  // Totals
  const totalSpend = expenses
    .filter((e) => e.type !== "credit") // Include all except "credit"
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredit = expenses
    .filter((e) => e.type === "credit")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Calculate user-wise total spend
  const userWiseSpend: { [user: string]: number } = {};
  expenses.forEach(e => {
    if (e.type === "spend") {
      userWiseSpend[e.spend_by] = (userWiseSpend[e.spend_by] || 0) + Number(e.amount);
    }
  });

  // Calculate user-wise overall total (all types)
  const userWiseTotal: { [user: string]: number } = {};
  expenses.forEach(e => {
    userWiseTotal[e.spend_by] = (userWiseTotal[e.spend_by] || 0) + Number(e.amount);
  });

  // Add or update expense
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.details || !form.spend_by || !form.amount || !form.type) {
      toast.error("Please fill all required fields");
      return;
    }
    // Prepare payload
    const payload: any = {
      date: form.date,
      details: form.details,
      spend_by: form.spend_by,
      amount: form.amount,
      reason: form.reason,
      type: form.type,
    };

    // If a new file is selected upload it first and set image_path
    if (imageFile) {
      const { path } = await uploadDocument(imageFile);
      if (path) payload.image_path = path;
    } else if (form.image) {
      // keep existing image path (when editing and not replacing)
      payload.image_path = form.image;
    }

    if (editing) {
      // Update
      const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
      if (!error) {
        toast.success("Expense updated");
        setShowForm(false);
        setEditing(null);
        setImageFile(null);
        setForm((f) => ({ ...f, image: null }));
        fetchExpenses();
      }
    } else {
      // Insert
      const { error } = await supabase.from("expenses").insert(payload);
      if (!error) {
        toast.success("Expense added");
        setShowForm(false);
        setImageFile(null);
        setForm((f) => ({ ...f, image: null }));
        fetchExpenses();
      }
    }
  };

  // Delete expense
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this entry?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) {
      toast.success("Deleted");
      fetchExpenses();
    }
  };

  // Download as Excel
  const handleDownload = () => {
    const ws = XLSX.utils.json_to_sheet(expenses.map(e => ({
      Date: e.date,
      Details: e.details,
      "Spend By": e.spend_by,
      Amount: e.amount,
      Reason: e.reason,
      Type: e.type,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, "expenses.xlsx");
  };

  // Filter, search, and sort logic
  const filteredExpenses = expenses
    .filter((e) =>
      filterType === "all" ? true : e.type === filterType
    )
    .filter((e) =>
      search
        ? (
            e.details.toLowerCase() +
            e.spend_by.toLowerCase() +
            (e.reason || "").toLowerCase()
          ).includes(search.toLowerCase())
        : true
    )
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      if (sortField === "date") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }
      if (sortField === "amount") {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }
      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <h1 className="font-heading text-3xl">Expense Tracking</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Entry
            </button>
            <button
              onClick={handleDownload}
              className="bg-card border border-card-border/10 rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-card/70 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Excel
            </button>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6 mb-8">
          <div className="card bg-primary-red/10">
            <h3 className="font-montserrat font-bold text-lg mb-2">Total Expenditure</h3>
            <p className="text-2xl font-bold text-primary-red">₹{totalSpend.toFixed(2)}</p>
          </div>
          <div className="card bg-green-500/10">
            <h3 className="font-montserrat font-bold text-lg mb-2">Total Credits</h3>
            <p className="text-2xl font-bold text-green-600">₹{totalCredit.toFixed(2)}</p>
          </div>
          {Object.entries(userWiseTotal).map(([user, amount]) => (
            <div key={user} className="card bg-blue-500/10">
              <h3 className="font-montserrat font-bold text-lg mb-2">{user} Overall Total</h3>
              <p className="text-2xl font-bold text-blue-600">₹{amount.toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Search, Filter, Sort Controls */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
          <input
            type="text"
            placeholder="Search by details, person, or reason"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full md:w-1/3 px-3 py-2 border rounded"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-3 py-2 border rounded"
          >
            <option value="all">All Types</option>
            {EXPENSE_TYPE_ORDER.map(type => (
              <option key={type} value={type}>
                {EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].label}
              </option>
            ))}
          </select>
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as any)}
            className="px-3 py-2 border rounded"
          >
            <option value="date">Sort by Date</option>
            <option value="amount">Sort by Amount</option>
            <option value="spend_by">Sort by Person</option>
          </select>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as any)}
            className="px-3 py-2 border rounded"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>

        {/* List */}
        <div className="bg-card/30 rounded-xl overflow-x-auto shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-4 text-left">Doc</th>
                  <th className="py-4 px-4 text-left">Date</th>
                  <th className="py-4 px-4 text-left">Details</th>
                  <th className="py-4 px-4 text-left">Spend By</th>
                  <th className="py-4 px-4 text-right">Amount</th>
                  <th className="py-4 px-4 text-left">Reason</th>
                  <th className="py-4 px-4 text-center">Type</th>
                  <th className="py-4 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((e) => (
                  <tr key={e.id} className="border-t border-card-border/10">
                    <td className="py-3 px-4">
                      {e.image_path ? (
                        // build public url from storage path
                        <img
                          src={supabase.storage.from("expenses").getPublicUrl(e.image_path as string).data.publicUrl || ""}
                          alt="doc"
                          className="w-12 h-8 object-cover rounded cursor-pointer"
                          onClick={() => {
                            const url = supabase.storage.from("expenses").getPublicUrl(e.image_path as string).data.publicUrl;
                            if (url) window.open(url, "_blank");
                          }}
                        />
                      ) : (
                        <span className="text-text/60">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{format(new Date(e.date), "yyyy-MM-dd")}</td>
                    <td className="py-3 px-4">{e.details}</td>
                    <td className="py-3 px-4">{e.spend_by}</td>
                    <td className="py-3 px-4 text-right">₹{Number(e.amount).toFixed(2)}</td>
                    <td className="py-3 px-4">{e.reason}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          EXPENSE_TYPE_COLORS[e.type].tailwind
                        }`}
                      >
                        {EXPENSE_TYPE_COLORS[e.type].label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        className="p-1 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                        onClick={() => {
                          setEditing(e);
                          setForm({
                            date: e.date,
                            details: e.details,
                            spend_by: e.spend_by,
                            amount: e.amount,
                            reason: e.reason,
                            type: e.type,
                            image: e.image_path || null,
                          });
                          setImageFile(null);
                          setShowForm(true);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-primary-red hover:bg-card/70 rounded-lg transition-colors"
                        onClick={() => handleDelete(e.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setForm({
                    date: "",
                    details: "",
                    spend_by: "",
                    amount: 0,
                    reason: "",
                    type: "spend",
                    image: null,
                  });
                  setImageFile(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-2xl font-bold mb-4 text-center">
                {editing ? "Edit Entry" : "Add Entry"}
              </h2>
              <form
                onSubmit={handleSubmit}
                className="grid grid-cols-1 gap-4"
              >
                <div>
                  <label className="block mb-1 font-medium">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Expenditure Details</label>
                  <input
                    type="text"
                    value={form.details}
                    onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Spend By</label>
                  <input
                    type="text"
                    value={form.spend_by}
                    onChange={e => setForm(f => ({ ...f, spend_by: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Amount</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Reason / Comment</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as "credit" | "spend" | "purchase" | "rent" }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    {EXPENSE_TYPE_ORDER.map(type => (
                      <option key={type} value={type}>
                        {EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].label}
                      </option>
                    ))}
                  </select>

                  {form.image ? (
                    <div className="mb-2">
                      <img
                        src={supabase.storage.from("expenses").getPublicUrl(form.image as string).data.publicUrl || ""}
                        alt="preview"
                        className="w-32 h-20 object-cover rounded mb-2"
                      />
                      <div className="text-sm text-text/60">Current document. Upload new to replace.</div>
                    </div>
                  ) : null}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0] || null;
                      setImageFile(f);
                    }}
                    className="w-full"
                    // only admins/superadmins can upload
                    disabled={!["admin", "superadmin"].includes(userRole?.name || "")}
                  />
                </div>
                <div className="flex justify-end gap-4 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                      setForm({
                        date: "",
                        details: "",
                        spend_by: "",
                        amount: 0,
                        reason: "",
                        type: "spend",
                        image: null,
                      });
                      setImageFile(null);
                    }}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90"
                  >
                    {editing ? "Update" : "Add"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* User-wise Spend & Credit Chart + Type Pie Chart */}
        {expenses.length > 0 && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Bar Chart */}
            <div className="bg-card/30 rounded-xl p-6 shadow-lg">
              <h3 className="font-montserrat font-bold text-lg mb-4">User-wise Spend & Credit</h3>
              <Bar
                data={{
                  labels: Array.from(new Set(expenses.map(e => e.spend_by))),
                  datasets: EXPENSE_TYPE_ORDER.map(type => ({
                    label: EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].label,
                    backgroundColor: EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].bg,
                    data: Array.from(
                      new Set(expenses.map(e => e.spend_by))
                    ).map(user =>
                      expenses
                        .filter(e => e.spend_by === user && e.type === type)
                        .reduce((sum, e) => sum + Number(e.amount), 0)
                    ),
                  })),
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: "top" as const },
                    tooltip: { enabled: true },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { callback: (v) => `₹${v}` },
                    },
                  },
                }}
                height={300}
              />
            </div>
            {/* Pie Chart */}
            <div className="bg-card/30 rounded-xl p-6 shadow-lg flex flex-col items-center justify-center">
              <h3 className="font-montserrat font-bold text-lg mb-4">Expense Type Distribution</h3>
              <Pie
                data={{
                  labels: EXPENSE_TYPE_ORDER.map(type => EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].label),
                  datasets: [
                    {
                      data: EXPENSE_TYPE_ORDER.map(
                        type => expenses.filter(e => e.type === type).reduce((sum, e) => sum + Number(e.amount), 0)
                      ),
                      backgroundColor: EXPENSE_TYPE_ORDER.map(type => EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].bg),
                      borderColor: EXPENSE_TYPE_ORDER.map(type => EXPENSE_TYPE_COLORS[type as keyof typeof EXPENSE_TYPE_COLORS].border),
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: "bottom" as const },
                    tooltip: { enabled: true },
                  },
                }}
                height={300}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}