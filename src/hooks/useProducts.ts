import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { Categories, Product, ProductImport } from '../types';
import * as XLSX from 'xlsx';

type ProductDB = Database['public']['Tables']['products']['Row'];
type CategoryDB = Database['public']['Tables']['categories']['Row'];

export interface ProductWithCategory extends ProductDB {
  categories: CategoryDB;
}

export function useProducts() {
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories:categories(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProducts(data as ProductWithCategory[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateProductStock = async (productId: string, stock: number) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ stock })
        .eq('id', productId);

      if (error) throw error;
      
      // Refresh products
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  const exportProductsToExcel = () => {
    try {
      // Format products for export
      const exportData = products.map(product => ({
        ID: product.id,
        Name: product.name,
        Category: product.categories.name,
        'Actual Price': product.actual_price,
        'Offer Price': product.offer_price,
        'Discount %': product.discount_percentage,
        Content: product.content,
        Stock: product.stock,
        Description: product.description
      }));

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
      
      // Generate Excel file
      XLSX.writeFile(workbook, 'products_export.xlsx');
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      return false;
    }
  };

  const importProductsFromExcel = async (file: File): Promise<boolean> => {
    try {
      // Read Excel file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Get first worksheet
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
      
      // Process and validate data
      const productsToImport: ProductImport[] = jsonData.map(row => ({
        name: row.Name || row.name,
        category: row.Category || row.category,
        actualPrice: Number(row['Actual Price'] || row.actualPrice || 0),
        offerPrice: Number(row['Offer Price'] || row.offerPrice || 0),
        discount: Number(row['Discount %'] || row.discount || 0),
        content: row.Content || row.content || '',
        stock: Number(row.Stock || row.stock || 0),
        description: row.Description || row.description || ''
      }));
      
      // Get categories
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name');
      
      // Map category names to IDs
      const categoryMap = new Map();
      categories?.forEach(cat => categoryMap.set(cat.name.toLowerCase(), cat.id));
      
      // Prepare products for insertion
      for (const product of productsToImport) {
        const categoryId = categoryMap.get(product.category.toLowerCase());
        
        if (!categoryId) {
          // Create new category if it doesn't exist
          const { data: newCategory } = await supabase
            .from('categories')
            .insert({ name: product.category })
            .select('id')
            .single();
            
          if (newCategory) {
            categoryMap.set(product.category.toLowerCase(), newCategory.id);
          }
        }
        
        // Insert or update product
        await supabase
          .from('products')
          .upsert({
            name: product.name,
            category_id: categoryMap.get(product.category.toLowerCase()),
            actual_price: product.actualPrice,
            offer_price: product.offerPrice,
            discount_percentage: product.discount,
            content: product.content,
            stock: product.stock,
            description: product.description
          });
      }
      
      // Refresh products
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      return false;
    }
  };

  return { 
    products, 
    loading, 
    error, 
    fetchProducts, 
    updateProductStock,
    exportProductsToExcel,
    importProductsFromExcel
  };
}