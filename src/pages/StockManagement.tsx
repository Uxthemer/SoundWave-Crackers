import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Save, X, Loader2, Download, Upload, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
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
  discount_percentage: string;
  image_url: string;
  description: string;
  categories?: {
    name: string;
  };
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
  const { userRole } = useAuth();

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
        .update({
          category_id: editForm.category_id,
          name: editForm.name,
          stock: editForm.stock,
          actual_price: editForm.actual_price,
          offer_price: editForm.offer_price,
          content: editForm.content,
          discount_percentage: editForm.discount_percentage,
          image_url: editForm.image_url,
          description: editForm.description
        })
        .eq('id', id);

      if (error) throw error;

      setEditingProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stock Management Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #FF5722; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .low-stock { color: #FF0000; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Stock Management Report</h1>
        <p>Generated on: ${format(new Date(), 'PPpp')}</p>
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Content</th>
              <th>Stock</th>
              <th>Actual Price</th>
              <th>Offer Price</th>
            </tr>
          </thead>
          <tbody>
            ${filteredProducts.map(product => `
              <tr>
                <td>${product.name}</td>
                <td>${product.categories?.name || '-'}</td>
                <td>${product.content || '-'}</td>
                <td class="${product.stock <= 20 ? 'low-stock' : ''}">${product.stock}</td>
                <td>₹${product.actual_price}</td>
                <td>₹${product.offer_price}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (!['admin', 'superadmin'].includes(userRole?.name || '')) {
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-4xl">Stock Management</h1>
            <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
              {filteredProducts.length} products
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
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
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
          >
            <Printer className="w-5 h-5" />
            <span>Print Report</span>
          </button>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">Product Name</th>
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-left">Content</th>
                  <th className="py-4 px-6 text-left">Stock</th>
                  <th className="py-4 px-6 text-left">Actual Price</th>
                  <th className="py-4 px-6 text-left">Offer Price</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text/60">
                      No products found
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="border-t border-card-border/10">
                      <td className="py-4 px-6">{product.name}</td>
                      <td className="py-4 px-6">{product.categories?.name}</td>
                      <td className="py-4 px-6">{product.content}</td>
                      <td className={`py-4 px-6 ${product.stock <= 20 ? 'text-red-500 font-bold' : ''}`}>
                        {product.stock}
                      </td>
                      <td className="py-4 px-6">₹{product.actual_price}</td>
                      <td className="py-4 px-6">₹{product.offer_price}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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