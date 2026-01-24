import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Plus, Trash2, Edit2, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface Transaction {
  id: string;
  vendor_id: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
  transaction_date: string;
}

interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
}

export function VendorDetails() {
  const { id } = useParams<{ id: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [formData, setFormData] = useState({
    type: "CREDIT" as "CREDIT" | "DEBIT",
    amount: "",
    description: "",
    transaction_date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Vendor Details
      const { data: vData, error: vError } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", id)
        .single();
      if (vError) throw vError;
      setVendor(vData);

      // 2. Transactions
      const { data: tData, error: tError } = await supabase
        .from("vendor_transactions")
        .select("*")
        .eq("vendor_id", id)
        .order("transaction_date", { ascending: true }) // Ascending for ledger
        .order("created_at", { ascending: true }); // Secondary sort

      if (tError) throw tError;
      setTransactions(tData || []);
    } catch (err: any) {
      toast.error("Failed to load data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Ledger (Running Balance)
  const ledger = useMemo(() => {
    let balance = 0;
    return transactions.map((t) => {
      // Logic: Credit (Purchase) increases payable, Debit (Payment) decreases.
      if (t.type === "CREDIT") balance += Number(t.amount);
      else balance -= Number(t.amount);
      
      return {
        ...t,
        runningBalance: balance,
      };
    });
  }, [transactions]);

  const currentBalance = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      const payload = {
        vendor_id: id,
        type: formData.type,
        amount: Number(formData.amount),
        description: formData.description,
        transaction_date: formData.transaction_date,
      };

      if (editingTx) {
        const { error } = await supabase
          .from("vendor_transactions")
          .update(payload)
          .eq("id", editingTx.id);
        if (error) throw error;
        toast.success("Transaction updated");
      } else {
        const { error } = await supabase
          .from("vendor_transactions")
          .insert([payload]);
        if (error) throw error;
        toast.success("Transaction added");
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error("Failed to save transaction");
    }
  };

  const handleDelete = async (txId: string) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      const { error } = await supabase.from("vendor_transactions").delete().eq("id", txId);
      if (error) throw error;
      toast.success("Deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete");
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setFormData({
      type: tx.type,
      amount: String(tx.amount),
      description: tx.description || "",
      transaction_date: tx.transaction_date,
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingTx(null);
    setFormData({
      type: "CREDIT",
      amount: "",
      description: "",
      transaction_date: new Date().toISOString().split("T")[0],
    });
  };

  const exportLedger = () => {
    if (!vendor) return;
    const data = ledger.map(l => ({
        Date: l.transaction_date,
        Description: l.description,
        Type: l.type,
        Debit: l.type === 'DEBIT' ? l.amount : 0,
        Credit: l.type === 'CREDIT' ? l.amount : 0,
        Balance: l.runningBalance
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `${vendor.name}_Ledger.xlsx`);
  };

  const handlePrint = () => {
      window.print();
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!vendor) return <div className="p-8 text-center">Vendor not found</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/vendors" className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
           <h1 className="text-2xl font-bold">{vendor.name} - Ledger</h1>
           <p className="text-text/60 text-sm">gst: {vendor.gstin || 'N/A'} | {vendor.phone}</p>
        </div>
      </div>

      {/* Balance Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-xl border border-card-border/10">
           <h3 className="text-sm font-semibold text-text/60 mb-2">Current Balance</h3>
           <div className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
             ₹ {currentBalance.toFixed(2)}
             <span className="text-sm font-normal ml-2 text-text/60">
                 {currentBalance > 0 ? '(Payable)' : '(Receivable / Paid)'}
             </span>
           </div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-card-border/10 flex items-center justify-between">
           <div>
               <h3 className="text-sm font-semibold text-text/60 mb-1">Total Purchased (Credit)</h3>
               <p className="text-2xl font-bold">₹ {ledger.filter(l => l.type === 'CREDIT').reduce((a,b) => a + Number(b.amount), 0).toFixed(2)}</p>
           </div>
           <div className="p-3 bg-blue-100 rounded-full text-blue-600">
               <TrendingDown />
           </div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-card-border/10 flex items-center justify-between">
           <div>
               <h3 className="text-sm font-semibold text-text/60 mb-1">Total Paid (Debit)</h3>
               <p className="text-2xl font-bold">₹ {ledger.filter(l => l.type === 'DEBIT').reduce((a,b) => a + Number(b.amount), 0).toFixed(2)}</p>
           </div>
           <div className="p-3 bg-green-100 rounded-full text-green-600">
               <TrendingUp />
           </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
          <button 
             onClick={() => { resetForm(); setIsModalOpen(true); }}
             className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded hover:bg-primary-orange/90"
          >
              <Plus className="w-4 h-4" /> Add Transaction
          </button>
          <button 
             onClick={exportLedger}
             className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
              <Download className="w-4 h-4" /> Export Excel
          </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-zinc-800 text-left">
                  <tr>
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 font-semibold">Description</th>
                      <th className="p-3 font-semibold text-right">Debit (Paid)</th>
                      <th className="p-3 font-semibold text-right">Credit (Purchased)</th>
                      <th className="p-3 font-semibold text-right">Balance</th>
                      <th className="p-3 font-semibold text-center">Actions</th>
                  </tr>
              </thead>
              <tbody>
                  {ledger.map((tx) => (
                      <tr key={tx.id} className="border-t border-card-border/10 hover:bg-card/50">
                          <td className="p-3 whitespace-nowrap">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</td>
                          <td className="p-3 max-w-xs truncate">{tx.description || '-'}</td>
                          <td className="p-3 text-right text-green-600 font-medium">
                              {tx.type === 'DEBIT' ? `₹${Number(tx.amount).toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right text-blue-600 font-medium">
                              {tx.type === 'CREDIT' ? `₹${Number(tx.amount).toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right font-bold">
                              ₹ {tx.runningBalance.toFixed(2)}
                          </td>
                          <td className="p-3 flex justify-center gap-2">
                             <button onClick={() => handleEdit(tx)} className="text-blue-500 hover:text-blue-700"><Edit2 className="w-4 h-4"/></button>
                             <button onClick={() => handleDelete(tx.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                          </td>
                      </tr>
                  ))}
                  {ledger.length === 0 && (
                      <tr>
                          <td colSpan={6} className="p-8 text-center text-text/60">No transactions recorded yet.</td>
                      </tr>
                  )}
              </tbody>
          </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
             <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4">{editingTx ? 'Edit Transaction' : 'Add Transaction'}</h2>
                <form onSubmit={handleSave}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <label className={`cursor-pointer border-2 rounded p-3 text-center ${formData.type === 'CREDIT' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-gray-100'}`}>
                                <input 
                                   type="radio" 
                                   name="type" 
                                   value="CREDIT" 
                                   checked={formData.type === 'CREDIT'}
                                   onChange={() => setFormData({...formData, type: 'CREDIT'})}
                                   className="hidden"
                                />
                                <div className="font-bold">Credit</div>
                                <div className="text-xs">Purchase / Stock In</div>
                            </label>
                            <label className={`cursor-pointer border-2 rounded p-3 text-center ${formData.type === 'DEBIT' ? 'border-green-500 bg-green-50 text-green-700' : 'border-transparent bg-gray-100'}`}>
                                <input 
                                   type="radio" 
                                   name="type" 
                                   value="DEBIT" 
                                   checked={formData.type === 'DEBIT'}
                                   onChange={() => setFormData({...formData, type: 'DEBIT'})}
                                   className="hidden"
                                />
                                <div className="font-bold">Debit</div>
                                <div className="text-xs">Payment / Sent</div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Date</label>
                            <input 
                                type="date"
                                required
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.transaction_date}
                                onChange={e => setFormData({...formData, transaction_date: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Amount</label>
                            <input 
                                type="number"
                                required
                                min="0.01"
                                step="any"
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.amount}
                                onChange={e => setFormData({...formData, amount: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea 
                                className="w-full border rounded px-3 py-2 bg-card"
                                rows={2}
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 rounded bg-primary-orange text-white hover:bg-primary-orange/90"
                        >
                            Save
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}
    </div>
  );
}
