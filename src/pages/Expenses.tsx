import { useState, useEffect, useRef, useMemo } from "react";
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
import { useDateRange } from "../hooks/useDateRange";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { personNameKey } from "../lib/personName";
import { NumberInput } from "../components/NumberInput";

interface Expense {
  id: string;
  date: string;
  details: string;
  /** Display name, kept in step with spend_by_id by a database trigger. */
  spend_by: string;
  /** The person who spent it. Null only on rows that predate the people list. */
  spend_by_id?: string | null;
  amount: number;
  reason: string;
  type: "credit" | "spend" | "purchase" | "rent"; // Added "rent"
  created_at: string;
  image_path?: string | null;
  reference_no?: string | null;
}

/** Someone money can be spent by: an owner, a partner, an employee. */
interface StaffMember {
  id: string;
  name: string;
  role: "owner" | "partner" | "employee" | "contractor" | "other";
  phone?: string | null;
  note?: string | null;
  is_active: boolean;
}

const STAFF_ROLES: StaffMember["role"][] = [
  "owner",
  "partner",
  "employee",
  "contractor",
  "other",
];

Chart.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type ExpenseForm = Omit<Expense, "id" | "created_at" | "amount"> & {
  /** Null while the box is empty, so a new entry does not start at 0. */
  amount: number | null;
  image?: string | null;
};

const blankExpenseForm = (): ExpenseForm => ({
  date: "",
  details: "",
  spend_by: "",
  spend_by_id: "",
  amount: null,
  reason: "",
  type: "spend",
  image: null,
  reference_no: "",
});

export function Expenses() {
  const { userRole } = useAuth();
  // Rows as stored. The page reads `expenses` (below), where every spelling
  // of a person's name has been folded into one.
  const [rawExpenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(blankExpenseForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);

  /**
   * Clears everything the popup holds, including the file picker.
   *
   * The popup used to be reset in two places with two different lists of
   * fields, and not at all after a save -- so "Add Entry" reopened with the
   * last entry's values, and the file input (which React does not control)
   * kept the previous attachment selected.
   */
  const resetExpenseForm = () => {
    setEditing(null);
    setForm(blankExpenseForm());
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const openNewExpense = () => {
    resetExpenseForm();
    setShowForm(true);
  };

  const closeExpenseForm = () => {
    setShowForm(false);
    resetExpenseForm();
  };

  // The people money can be spent by, and the panel for maintaining them.
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState<{
    id?: string;
    name: string;
    role: StaffMember["role"];
    phone: string;
    note: string;
  }>({ name: "", role: "employee", phone: "", note: "" });
  const [savingStaff, setSavingStaff] = useState(false);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "spend" | "credit" | "purchase" | "rent">("all");
  const [sortField, setSortField] = useState<"date" | "amount" | "spend_by">("date");

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Date range filter logic
  const { range, setRange, customStart, setCustomStart, customEnd, setCustomEnd, getDateRange, ready } = useDateRange();
  const [isApplying, setIsApplying] = useState(false);

  // Only the newest request may write the table. The period can change while
  // a slow all-years query is still in flight, and its late answer used to
  // overwrite the season's.
  const latestRequest = useRef(0);

  // Fetch expenses
  const fetchExpenses = async (startDate?: Date, endDate?: Date) => {
    const request = ++latestRequest.current;
    setLoading(true);
    let query = supabase
      .from("expenses")
      .select("*")
      .order("date", { ascending: false });

     if (startDate && endDate) {
       query = query
         .gte("date", startDate.toISOString())
         .lte("date", endDate.toISOString());
     }

    const { data, error } = await query;
    if (request !== latestRequest.current) return;
    if (!error && data) setExpenses(data as Expense[]);
    setLoading(false);
  };

  /** Reloads whatever period the dropdown is showing. */
  const reloadExpenses = () => {
    const { startDate, endDate } = getDateRange();
    return fetchExpenses(startDate, endDate);
  };

  // `ready` holds the first fetch until the season list has loaded and the
  // dropdown has settled on the live season. Fetching before that asked for
  // every year first, which is what the table showed while the dropdown
  // already said the current season.
  useEffect(() => {
    if (!ready) return;
    if (range !== "custom") {
      reloadExpenses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, ready]);

  const handleApplyCustom = async () => {
    setIsApplying(true);
    const { startDate, endDate } = getDateRange();
    await fetchExpenses(startDate, endDate);
    setIsApplying(false);
  };

  /**
   * Loads the people list.
   *
   * Inactive members are loaded too: someone who has left still appears on
   * the expenses they made, and hiding them would show those rows as blank.
   * The picker offers only the active ones.
   */
  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from("staff_members")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) {
      console.error("Failed to load people:", error);
      return;
    }
    setStaff((data as StaffMember[]) ?? []);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const activeStaff = staff.filter((member) => member.is_active);

  /**
   * Every row under one spelling per person.
   *
   * Totals, the chart and "Sort by Person" all group on `spend_by`, so
   * "Sankar Raj" and "sankarraj" used to be two bars. A row is filed under the
   * person on the list with the same name key; a name nobody has added yet
   * falls back to the spelling used most often in the loaded rows.
   */
  const expenses = useMemo(() => {
    const listed = new Map(
      staff.map((member) => [personNameKey(member.name), member.name])
    );

    const spellings = new Map<string, Map<string, number>>();
    rawExpenses.forEach((row) => {
      const key = personNameKey(row.spend_by);
      if (!key || listed.has(key)) return;
      const counts = spellings.get(key) ?? new Map<string, number>();
      const label = (row.spend_by ?? "").trim();
      counts.set(label, (counts.get(label) ?? 0) + 1);
      spellings.set(key, counts);
    });

    const unlisted = new Map<string, string>();
    spellings.forEach((counts, key) => {
      const [mostUsed] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      unlisted.set(key, mostUsed);
    });

    return rawExpenses.map((row) => {
      const key = personNameKey(row.spend_by);
      const name = listed.get(key) ?? unlisted.get(key);
      return name && name !== row.spend_by ? { ...row, spend_by: name } : row;
    });
  }, [rawExpenses, staff]);

  const handleSaveStaff = async () => {
    // Runs of spaces are collapsed so "Sankar  Raj" is stored tidily.
    const name = staffForm.name.trim().replace(/\s+/g, " ");
    if (!name) {
      toast.error("Enter a name");
      return;
    }

    // Same letters, different case or spacing, is the same person. Said here
    // with the existing name, rather than as a bare database error.
    const clash = staff.find(
      (member) =>
        member.id !== staffForm.id &&
        personNameKey(member.name) === personNameKey(name)
    );
    if (clash) {
      toast.error(`${name} is the same person as ${clash.name}, already on the list`);
      return;
    }

    setSavingStaff(true);
    try {
      const payload = {
        name,
        role: staffForm.role,
        phone: staffForm.phone.trim() || null,
        note: staffForm.note.trim() || null,
      };

      const { error } = staffForm.id
        ? await supabase
            .from("staff_members")
            .update(payload)
            .eq("id", staffForm.id)
        : await supabase.from("staff_members").insert(payload);

      if (error) throw error;

      toast.success(staffForm.id ? "Person updated" : "Person added");
      setStaffForm({ name: "", role: "employee", phone: "", note: "" });
      await fetchStaff();
      // A rename propagates to every expense, so the list behind this modal
      // is now out of date.
      if (staffForm.id) reloadExpenses();
    } catch (err: any) {
      // The unique index on the name is the likely failure, and saying so is
      // more use than "failed to save".
      toast.error(
        /duplicate|unique/i.test(err?.message ?? "")
          ? `${name} is already on the list`
          : err?.message || "Failed to save"
      );
    } finally {
      setSavingStaff(false);
    }
  };

  /**
   * Deactivates rather than deletes.
   *
   * Expenses reference the person, so removing the row would either fail on
   * the foreign key or orphan the history behind it.
   */
  const handleToggleStaffActive = async (member: StaffMember) => {
    const { error } = await supabase
      .from("staff_members")
      .update({ is_active: !member.is_active })
      .eq("id", member.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    fetchStaff();
  };

  /**
   * Stores an attachment in the 'expenses' bucket and returns its path.
   *
   * Throws rather than returning null: the caller used to carry on and save
   * the expense without its attachment, which looked like success and lost
   * the receipt. The storage error is passed through because "upload failed"
   * alone says nothing about whether it was the bucket, a permission or the
   * file.
   */
  async function uploadDocument(file: File): Promise<string> {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    // Anything outside a safe set is replaced: storage keys reject some
    // characters that are perfectly legal in a phone's file names.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `expenses/${id}_${safeName}`;

    const { error } = await supabase.storage
      .from("expenses")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (error) {
      console.error("Attachment upload failed:", error);
      throw new Error(`Attachment could not be uploaded: ${error.message}`);
    }
    return path;
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
    if (savingExpense) return;
    if (!form.date || !form.details || !form.spend_by_id || !form.amount || !form.type) {
      toast.error("Please fill all required fields, including who spent it");
      return;
    }
    // Prepare payload. spend_by (the name) is filled in by the database
    // trigger from spend_by_id, so it is never sent from here -- that is what
    // stops the two drifting apart.
    const payload: any = {
      date: form.date,
      details: form.details,
      spend_by_id: form.spend_by_id,
      amount: form.amount,
      reason: form.reason,
      type: form.type,
      reference_no: form.reference_no || null,
    };

    setSavingExpense(true);
    try {
      // The attachment goes first, and a failed upload stops the save: an
      // expense saved without the receipt the user just attached is worse
      // than one not saved yet, because nobody notices it is missing.
      if (imageFile) {
        payload.image_path = await uploadDocument(imageFile);
      } else if (form.image) {
        // Editing without replacing: keep the attachment already there.
        payload.image_path = form.image;
      }

      const { error } = editing
        ? await supabase.from("expenses").update(payload).eq("id", editing.id)
        : await supabase.from("expenses").insert(payload);

      if (error) throw error;

      toast.success(editing ? "Expense updated" : "Expense added");
      closeExpenseForm();
      reloadExpenses();
    } catch (err) {
      // The popup stays open with everything still filled in, so fixing the
      // problem does not mean typing the entry again.
      toast.error(err instanceof Error ? err.message : "Could not save the expense");
    } finally {
      setSavingExpense(false);
    }
  };

  // Delete expense
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this entry?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) {
      toast.success("Deleted");
      reloadExpenses();
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

  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!["admin", "superadmin"].includes(userRole?.name || "")) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex flex-col gap-2">
             <h1 className="font-heading text-3xl">Expense Tracking</h1>
             <DateRangeFilter
               range={range}
               setRange={setRange}
               customStart={customStart}
               setCustomStart={setCustomStart}
               customEnd={customEnd}
               setCustomEnd={setCustomEnd}
               onApply={handleApplyCustom}
               isApplying={isApplying}
             />
          </div>
          <div className="flex gap-2 items-start">
            <button
              onClick={openNewExpense}
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
                            spend_by_id: e.spend_by_id || "",
                            amount: e.amount,
                            reason: e.reason,
                            type: e.type,
                            image: e.image_path || null,
                            reference_no: e.reference_no || "",
                          });
                          setImageFile(null);
                          if (imageInputRef.current) imageInputRef.current.value = "";
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
                onClick={closeExpenseForm}
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium">Spent by *</label>
                    <button
                      type="button"
                      onClick={() => setShowStaffModal(true)}
                      className="text-xs text-primary-orange font-semibold hover:underline"
                    >
                      + Add / manage people
                    </button>
                  </div>
                  <select
                    value={form.spend_by_id || ""}
                    onChange={e =>
                      setForm(f => ({ ...f, spend_by_id: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    <option value="">Select a person</option>
                    {activeStaff.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                    {/* An expense being edited may name someone who has since
                        left. Keeping them selectable means opening the form
                        does not silently reassign the spend. */}
                    {form.spend_by_id &&
                      !activeStaff.some(m => m.id === form.spend_by_id) && (
                        <option value={form.spend_by_id}>
                          {form.spend_by} (inactive)
                        </option>
                      )}
                  </select>
                  {activeStaff.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No people added yet — add one to record who spent the
                      money.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block mb-1 font-medium">
                    Reference / bill no.
                  </label>
                  <input
                    type="text"
                    value={form.reference_no || ""}
                    onChange={e =>
                      setForm(f => ({ ...f, reference_no: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Amount</label>
                  <NumberInput
                    value={form.amount}
                    onValueChange={amount => setForm(f => ({ ...f, amount }))}
                    onClear={() => setForm(f => ({ ...f, amount: null }))}
                    min={0}
                    step="0.01"
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
                    onClick={closeExpenseForm}
                    disabled={savingExpense}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingExpense}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 disabled:opacity-60 disabled:cursor-wait"
                  >
                    {savingExpense && <Loader2 className="w-4 h-4 animate-spin" />}
                    {savingExpense
                      ? imageFile
                        ? "Uploading…"
                        : "Saving…"
                      : editing
                      ? "Update"
                      : "Add"}
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

      {/* People who can spend money. Kept here rather than on a page of its
          own: it is only ever needed while recording an expense. */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b">
              <div>
                <h2 className="text-xl font-bold">People</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Owners, partners and employees who spend on the business.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowStaffModal(false);
                  setStaffForm({
                    name: "",
                    role: "employee",
                    phone: "",
                    note: "",
                  });
                }}
                aria-label="Close"
                className="text-gray-500 hover:text-red-500 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-5 border-b bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name *
                  </label>
                  <input
                    value={staffForm.name}
                    onChange={(e) =>
                      setStaffForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Full name"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    value={staffForm.role}
                    onChange={(e) =>
                      setStaffForm((f) => ({
                        ...f,
                        role: e.target.value as StaffMember["role"],
                      }))
                    }
                    className="w-full px-3 py-2 border rounded capitalize"
                  >
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role} className="capitalize">
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Phone
                  </label>
                  <input
                    value={staffForm.phone}
                    onChange={(e) =>
                      setStaffForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Note</label>
                  <input
                    value={staffForm.note}
                    onChange={(e) =>
                      setStaffForm((f) => ({ ...f, note: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-3">
                {staffForm.id && (
                  <button
                    onClick={() =>
                      setStaffForm({
                        name: "",
                        role: "employee",
                        phone: "",
                        note: "",
                      })
                    }
                    className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  onClick={handleSaveStaff}
                  disabled={savingStaff || !staffForm.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90 text-sm disabled:opacity-40"
                >
                  {savingStaff && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{staffForm.id ? "Save changes" : "Add person"}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {staff.length === 0 ? (
                <p className="text-center text-gray-500 py-6">
                  Nobody added yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 font-medium">Name</th>
                      <th className="py-2 font-medium">Role</th>
                      <th className="py-2 font-medium">Phone</th>
                      <th className="py-2 font-medium text-right">Spent</th>
                      <th className="py-2 font-medium text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => (
                      <tr
                        key={member.id}
                        className={`border-b ${
                          member.is_active ? "" : "opacity-50"
                        }`}
                      >
                        <td className="py-2">
                          {member.name}
                          {!member.is_active && (
                            <span className="ml-2 text-xs text-gray-500">
                              (inactive)
                            </span>
                          )}
                        </td>
                        <td className="py-2 capitalize">{member.role}</td>
                        <td className="py-2">{member.phone || "-"}</td>
                        {/* The total each person is carrying, over whatever
                            date range is currently filtered. */}
                        <td className="py-2 text-right">
                          ₹
                          {expenses
                            .filter((e) => e.spend_by_id === member.id)
                            .reduce((sum, e) => sum + Number(e.amount), 0)
                            .toFixed(2)}
                        </td>
                        <td className="py-2 text-center whitespace-nowrap">
                          <button
                            onClick={() =>
                              setStaffForm({
                                id: member.id,
                                name: member.name,
                                role: member.role,
                                phone: member.phone || "",
                                note: member.note || "",
                              })
                            }
                            title="Edit"
                            className="p-1 text-primary-orange hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStaffActive(member)}
                            title={
                              member.is_active
                                ? "Deactivate — keeps their past expenses"
                                : "Reactivate"
                            }
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded ml-1 text-xs font-semibold"
                          >
                            {member.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
