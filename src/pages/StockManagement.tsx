import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Save, X, Loader2, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useProducts } from '../hooks/useProducts';

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
  const { products: allProducts, loading: productsLoading, exportProductsToExcel, importProductsFromExcel } = useProducts();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    category_id: '',
    stock: 0,
    actual_price: 0,
    offer_price: 0,
    content: ''
  });
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

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
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product.id);
    setEditForm({
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      stock: product.stock,
      actual_price: product.actual_price,
      offer_price: product.offer_price,
      content: product.content
    });
  };

  const handleSave = async (id: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update(editForm)
        .eq('id', id);

      if (error) throw error;

      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const handleCancel = () => {
    setEditingProduct(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: name === 'stock' || name === 'actual_price' || name === 'offer_price' 
        ? parseFloat(value) 
        : value
    }));
  };

  const handleNewProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: name === 'stock' || name === 'actual_price' || name === 'offer_price' 
        ? parseFloat(value) 
        : value
    }));
  };

  const handleAddProduct = async () => {
    try {
      const { error } = await supabase
        .from('products')
        .insert({
          name: newProduct.name,
          category_id: newProduct.category_id,
          stock: newProduct.stock || 0,
          actual_price: newProduct.actual_price || 0,
          offer_price: newProduct.offer_price || 0,
          content: newProduct.content || '',
          discount_percentage: newProduct.actual_price && newProduct.offer_price 
            ? Math.round(((newProduct.actual_price - newProduct.offer_price) / newProduct.actual_price) * 100) 
            : 0
        });

      if (error) throw error;

      setShowAddForm(false);
      setNewProduct({
        name: '',
        category_id: '',
        stock: 0,
        actual_price: 0,
        offer_price: 0,
        content: ''
      });
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportStatus('loading');
      const success = await importProductsFromExcel(file);
      
      if (success) {
        setImportStatus('success');
        setTimeout(() => setImportStatus('idle'), 3000);
      } else {
        setImportStatus('error');
        setImportError('Failed to import products');
      }
    } catch (error) {
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import failed');
    }
  };

  const filteredProducts = allProducts
    .filter(product => 
      (product.name?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (categoryFilter === 'all' || product.category?.id === categoryFilter)
    );

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-6">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-4xl mb-2">Stock Management</h1>
            <p className="text-text/60">Manage your product inventory</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 bg-primary-orange text-white rounded-lg px-4 py-2 hover:bg-primary-red transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
            
            <button
              onClick={exportProductsToExcel}
              className="flex items-center gap-2 bg-card border border-card-border/10 rounded-lg px-4 py-2 hover:bg-card/70 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            
            <label className="flex items-center gap-2 bg-card border border-card-border/10 rounded-lg px-4 py-2 hover:bg-card/70 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Import</span>
              <input 
                type="file" 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>
        
        {importStatus === 'loading' && (
          <div className="bg-card/30 p-4 rounded-lg mb-8 flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary-orange" />
            <span>Importing products, please wait...</span>
          </div>
        )}
        
        {importStatus === 'success' && (
          <div className="bg-green-500/10 text-green-500 p-4 rounded-lg mb-8 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span>Products imported successfully!</span>
          </div>
        )}
        
        {importStatus === 'error' && (
          <div className="bg-red-500/10 text-red-500 p-4 rounded-lg mb-8 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{importError || 'Failed to import products'}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-card border border-card-border/10 rounded-lg focus:outline-none focus:border-primary-orange"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
          </div>
          <div className="w-full md:w-64">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 bg-card border border-card-border/10 rounded-lg focus:outline-none focus:border-primary-orange"
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

        {showAddForm && (
          <div className="bg-card/30 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-montserrat font-bold text-xl">Add New Product</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 hover:bg-card/50 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Product Name</label>
                <input
                  type="text"
                  name="name"
                  value={newProduct.name || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  name="category_id"
                  value={newProduct.category_id || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                >
                  <option value="">Select Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Actual Price</label>
                <input
                  type="number"
                  name="actual_price"
                  value={newProduct.actual_price || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Offer Price</label>
                <input
                  type="number"
                  name="offer_price"
                  value={newProduct.offer_price || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Stock</label>
                <input
                  type="number"
                  name="stock"
                  value={newProduct.stock || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Content</label>
                <input
                  type="text"
                  name="content"
                  value={newProduct.content || ''}
                  onChange={handleNewProductChange}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  placeholder="e.g., 1 Box - 10 Pieces"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={handleAddProduct}
                  className="btn-primary w-full"
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">Product</th>
                  <th className="py-4 px-6 text-left">Category</th>
                  <th className="py-4 px-6 text-right">Price</th>
                  <th className="py-4 px-6 text-right">Stock</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {productsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text/60">
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-orange mr-2" />
                        <span>Loading products...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text/60">
                      No products found
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="border-t border-card-border/10">
                      <td className="py-4 px-6">
                        {editingProduct === product.id ? (
                          <input
                            type="text"
                            name="name"
                            value={editForm.name || ''}
                            onChange={handleInputChange}
                            className="w-full px-3 py-1 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                          />
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-card">
                              <img
                                src={product.image_url || 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop'}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <h3 className="font-montserrat font-bold">{product.name}</h3>
                              <p className="text-xs text-text/60">{product.content}</p>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        {editingProduct === product.id ? (
                          <select
                            name="category_id"
                            value={editForm.category_id || ''}
                            onChange={handleInputChange}
                            className="w-full px-3 py-1 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{product.category?.name}</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {editingProduct === product.id ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              name="actual_price"
                              value={editForm.actual_price || ''}
                              onChange={handleInputChange}
                              className="w-full px-3 py-1 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                              placeholder="Actual Price"
                            />
                            <input
                              type="number"
                              name="offer_price"
                              value={editForm.offer_price || ''}
                              onChange={handleInputChange}
                              className="w-full px-3 py-1 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                              placeholder="Offer Price"
                            />
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-text/60 line-through">₹{product.actual_price}</p>
                            <p className="font-bold text-primary-orange">₹{product.offer_price}</p>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {editingProduct === product.id ? (
                          <input
                            type="number"
                            name="stock"
                            value={editForm.stock || ''}
                            onChange={handleInputChange}
                            className="w-full px-3 py-1 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                          />
                        ) : (
                          <span className={`font-bold ${product.stock <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {product.stock}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {editingProduct === product.id ? (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleSave(product.id)}
                              className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancel}
                              className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(product)}
                              className="p-2 bg-primary-orange/10 text-primary-orange rounded-lg hover:bg-primary-orange/20 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}