import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Edit2, Trash2, Eye, Building2, BarChart3, X } from "lucide-react";
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
  // Commercial terms — used to compute landed cost when a vendor price list
  // is imported, and to rank vendors when generating a purchase plan.
  discount_percent?: number;
  gst_percent?: number;
  packing_percent?: number;
  other_charges_percent?: number;
  rating?: number;
  lead_time_days?: number | null;
  is_preferred?: boolean;
}

const EMPTY_VENDOR_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  discount_percent: 0,
  gst_percent: 18,
  packing_percent: 0,
  other_charges_percent: 0,
  rating: 3,
  lead_time_days: "" as number | string,
  is_preferred: false,
};

export function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Form State
  const [formData, setFormData] = useState({ ...EMPTY_VENDOR_FORM });

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
      const payload = {
        ...formData,
        discount_percent: Number(formData.discount_percent) || 0,
        gst_percent: Number(formData.gst_percent) || 0,
        packing_percent: Number(formData.packing_percent) || 0,
        other_charges_percent: Number(formData.other_charges_percent) || 0,
        rating: Number(formData.rating) || 0,
        lead_time_days:
          formData.lead_time_days === "" ? null : Number(formData.lead_time_days),
      };

      if (editingVendor) {
        const { error } = await supabase
          .from("vendors")
          .update(payload)
          .eq("id", editingVendor.id);
        if (error) throw error;
        toast.success("Vendor updated successfully");
      } else {
        const { error } = await supabase.from("vendors").insert([payload]);
        if (error) throw error;
        toast.success("Vendor added successfully");
      }
      setIsModalOpen(false);
      setEditingVendor(null);
      setFormData({ ...EMPTY_VENDOR_FORM });
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
      discount_percent: Number(v.discount_percent ?? 0),
      gst_percent: Number(v.gst_percent ?? 18),
      packing_percent: Number(v.packing_percent ?? 0),
      other_charges_percent: Number(v.other_charges_percent ?? 0),
      rating: Number(v.rating ?? 3),
      lead_time_days: v.lead_time_days ?? "",
      is_preferred: !!v.is_preferred,
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingVendor(null);
    setFormData({ ...EMPTY_VENDOR_FORM });
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
                <Link
                  to="/price-comparing"
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                  title="Open Price Comparison"
                >
                  <BarChart3 className="w-5 h-5" />
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
            {/* Capped to the viewport with the body scrolling inside it. Without
                the cap, the commercial-terms section makes the form taller than
                the screen and flex centring pushes the overflow off BOTH ends —
                the first fields become unreachable. */}
            <div className="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-card-border/10 shrink-0">
                    <h2 className="text-xl font-bold">{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        aria-label="Close"
                        className="p-1 -m-1 rounded hover:bg-card/70 text-text/60 hover:text-text transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
                    <div className="space-y-4 overflow-y-auto px-6 py-4 flex-1 min-h-0">
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

                        {/* Commercial terms. These are applied when this vendor's
                            price list is imported and drive landed cost, which is
                            what purchase planning ranks vendors on. */}
                        <div className="pt-4 border-t border-card-border/10">
                            <h3 className="font-semibold mb-1">Commercial terms</h3>
                            <p className="text-sm text-text/60 mb-4">
                                Landed cost = list × (1 − discount%) + packing%, then
                                + GST%, then + other charges%.
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Discount %</label>
                                    <input
                                        type="number" step="0.01" min="0" max="100"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.discount_percent}
                                        onChange={e => setFormData({...formData, discount_percent: e.target.value as any})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">GST %</label>
                                    <input
                                        type="number" step="0.01" min="0" max="100"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.gst_percent}
                                        onChange={e => setFormData({...formData, gst_percent: e.target.value as any})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Packing %</label>
                                    <input
                                        type="number" step="0.01" min="0" max="100"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.packing_percent}
                                        onChange={e => setFormData({...formData, packing_percent: e.target.value as any})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Other charges %</label>
                                    <input
                                        type="number" step="0.01" min="0" max="100"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.other_charges_percent}
                                        onChange={e => setFormData({...formData, other_charges_percent: e.target.value as any})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Rating (0–5)
                                    </label>
                                    <input
                                        type="number" step="0.1" min="0" max="5"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.rating}
                                        onChange={e => setFormData({...formData, rating: e.target.value as any})}
                                    />
                                    <p className="text-xs text-text/50 mt-1">
                                        Breaks ties when landed costs are close.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Lead time (days)</label>
                                    <input
                                        type="number" min="0"
                                        className="w-full border rounded px-3 py-2 bg-card"
                                        value={formData.lead_time_days}
                                        onChange={e => setFormData({...formData, lead_time_days: e.target.value as any})}
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 mt-4">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-primary-orange"
                                    checked={formData.is_preferred}
                                    onChange={e => setFormData({...formData, is_preferred: e.target.checked})}
                                />
                                <span className="text-sm">
                                    Preferred vendor — wins ties against equally priced vendors
                                </span>
                            </label>
                        </div>
                    </div>
                    {/* Pinned outside the scroll area so Save stays reachable
                        however long the form gets. */}
                    <div className="flex justify-end gap-3 p-4 border-t border-card-border/10 shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 rounded bg-card hover:bg-card/70 border border-card-border/10"
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
