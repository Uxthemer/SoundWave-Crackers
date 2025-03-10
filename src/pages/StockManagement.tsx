import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Save, X, Loader2, Download, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRoles } from '../hooks/useRoles';
import { BulkImportModal } from '../components/BulkImportModal';
import * as XLSX from 'xlsx';

interface Product {
  id: string;
  name: string;
  category_id: string;
  stock: number;
  actual_price: number;
  offer_price: number;
  content: string;
}

interface Category {
  id: string;
  name: string;
}

export function StockManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const { userRole } = useRoles();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories:category_id (
            name
          )
        `)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product.id);
    setEditForm(product);
  };

  const handleSave = async (id: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update(editForm)
        .eq('id', id);

      if (error) throw error;

      setEditingProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const handleExport = () => {
    const exportData = products.map(product => ({
      name: product.name,
      category: (product as any).categories?.name,
      stock: product.stock,
      actual_price: product.actual_price,
      offer_price: product.offer_price,
      content: product.content
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'products_export.xlsx');
  };

  const handleAddProduct = async () => {
    try {
      const { error } = await supabase
        .from('products')
        .insert({
          name: 'New Product',
          category_id: categories[0]?.id,
          actual_price: 0,
          offer_price: 0,
          stock: 0,
          content: '1 Box'
        });

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!['admin', 'superadmin'].includes(userRole || '')) {
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
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="font-heading text-4xl">Stock Management</h1>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={handleAddProduct}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add Product</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Export</span>
          </button>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">Product Name</th>
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-right">Stock</th>
                  <th className="py-4 px-6 text-right">Actual Price</th>
                  <th className="py-4 px-6 text-right">Offer Price</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-t border-card-border/10">
                    <td className="py-4 px-6">
                      {editingProduct === product.id ? (
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-background border border-card-border/10"
                        />
                      ) : (
                        product.name
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {editingProduct === product.id ? (
                        <select
                          value={editForm.category_id || ''}
                          onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-background border border-card-border/10"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        (product as any).categories?.name
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {editingProduct === product.id ? (
                        <input
                          type="number"
                          value={editForm.stock || 0}
                          onChange={(e) => setEditForm({ ...editForm, stock: parseInt(e.target.value) })}
                          className="w-24 px-2 py-1 rounded bg-background border border-card-border/10 text-right"
                        />
                      ) : (
                        product.stock
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {editingProduct === product.id ? (
                        <input
                          type="number"
                          value={editForm.actual_price || 0}
                          onChange={(e) => setEditForm({ ...editForm, actual_price: parseFloat(e.target.value) })}
                          className="w-24 px-2 py-1 rounded bg-background border border-card-border/10 text-right"
                        />
                      ) : (
                        `₹${product.actual_price}`
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {editingProduct === product.id ? (
                        <input
                          type="number"
                          value={editForm.offer_price || 0}
                          onChange={(e) => setEditForm({ ...editForm, offer_price: parseFloat(e.target.value) })}
                          className="w-24 px-2 py-1 rounded bg-background border border-card-border/10 text-right"
                        />
                      ) : (
                        `₹${product.offer_price}`
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {editingProduct === product.id ? (
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleSave(product.id)}
                            className="p-1 text-green-500 hover:text-green-600"
                          >
                            <Save className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setEditingProduct(null)}
                            className="p-1 text-primary-red hover:text-primary-red/80"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-1 text-primary-orange hover:text-primary-orange/80"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchProducts}
      />
    </div>
  );
}