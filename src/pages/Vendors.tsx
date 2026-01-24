import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Edit2, Trash2, Eye, Building2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface Vendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  created_at: string;
  balance?: number; // Calculated on client
}

export function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      // Fetch vendors
      const { data: vendorList, error: vError } = await supabase
        .from("vendors")
        .select("*")
        .order("name");

      if (vError) throw vError;

      // Fetch transactions to calculate balance for each vendor
      // Optimization: For many vendors, maybe do a database function. For now, client-side.
      const { data: transactions, error: tError } = await supabase
        .from("vendor_transactions")
        .select("vendor_id, type, amount");

      if (tError) throw tError;

      // Calculate Map
      const balanceMap: Record<string, number> = {};
      (transactions || []).forEach((t) => {
        const amt = Number(t.amount) || 0;
        if (!balanceMap[t.vendor_id]) balanceMap[t.vendor_id] = 0;
        // Credit (Purchase) increases balance (we owe them)
        // Debit (Payment) decreases balance
        if (t.type === "CREDIT") balanceMap[t.vendor_id] += amt;
        else balanceMap[t.vendor_id] -= amt;
      });

      const processedVendors = (vendorList || []).map((v) => ({
        ...v,
        balance: balanceMap[v.id] || 0,
      }));

      setVendors(processedVendors);
    } catch (err: any) {
        console.error("Error fetching vendors:", err);
        toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        const { error } = await supabase
          .from("vendors")
          .update(formData)
          .eq("id", editingVendor.id);
        if (error) throw error;
        toast.success("Vendor updated successfully");
      } else {
        const { error } = await supabase.from("vendors").insert([formData]);
        if (error) throw error;
        toast.success("Vendor added successfully");
      }
      setIsModalOpen(false);
      setEditingVendor(null);
      setFormData({ name: "", phone: "", email: "", address: "", gstin: "" });
      fetchVendors();
    } catch (err: any) {
      toast.error(err.message || "Failed to save vendor");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure? This will delete all transactions for this vendor.")) return;
    try {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
      toast.success("Vendor deleted");
      fetchVendors();
    } catch (err: any) {
      toast.error("Failed to delete vendor");
    }
  };

  const handleEdit = (v: Vendor) => {
    setEditingVendor(v);
    setFormData({
      name: v.name,
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      gstin: v.gstin || "",
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingVendor(null);
    setFormData({ name: "", phone: "", email: "", address: "", gstin: "" });
    setIsModalOpen(true);
  };

  const filteredVendors = vendors.filter((v) =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100">
            Vendor Management
          </h1>
          <p className="text-text/60 mt-1">Manage suppliers and track ledgers</p>
        </div>
        <button
          onClick={handleAddNew}
          className="bg-primary-orange text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary-orange/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Vendor
        </button>
      </div>

      <div className="mb-6 relative">
        <input
          type="text"
          placeholder="Search vendors..."
          className="w-full md:w-1/3 pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-orange bg-card"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVendors.map((vendor) => (
            <div
              key={vendor.id}
              className="bg-card rounded-xl shadow-lg border border-card-border/10 p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-primary-orange/10 rounded-full">
                    <Building2 className="w-6 h-6 text-primary-orange" />
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                      (vendor.balance || 0) > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    ₹ {(vendor.balance || 0).toFixed(2)}
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2">{vendor.name}</h3>
                <div className="space-y-2 text-sm text-text/70 mb-4">
                  <p>Ph: {vendor.phone || "-"}</p>
                  <p>GST: {vendor.gstin || "-"}</p>
                  <p className="line-clamp-2">{vendor.address}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-card-border/10">
                <Link
                  to={`/vendors/${vendor.id}`}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title="View Ledger"
                >
                  <Eye className="w-5 h-5" />
                </Link>
                <button
                  onClick={() => handleEdit(vendor)}
                  className="p-2 text-green-600 hover:bg-green-50 rounded"
                  title="Edit"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(vendor.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {filteredVendors.length === 0 && (
            <div className="col-span-full text-center py-12 text-text/60">
              No vendors found.
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4">{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
                <form onSubmit={handleSave}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Vendor Name *</label>
                            <input 
                                required
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Phone</label>
                            <input 
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Email</label>
                            <input 
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">GSTIN</label>
                            <input 
                                className="w-full border rounded px-3 py-2 bg-card"
                                value={formData.gstin}
                                onChange={e => setFormData({...formData, gstin: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Address</label>
                            <textarea 
                                className="w-full border rounded px-3 py-2 bg-card"
                                rows={3}
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
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
