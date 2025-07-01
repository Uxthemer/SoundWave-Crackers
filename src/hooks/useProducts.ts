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

    // Set up realtime subscription
    const subscription = supabase
      .channel('products-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'products' 
      }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories:category_id (
            id,
            name,
            description,
            image_url
          )
        `)
        .eq('is_active', true) // Only fetch active products
        .order('order', { nullsFirst: false }) // sort by order, nulls last
        .order('name'); // fallback sort

      if (error) throw error;

      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
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
      
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  const exportProductsToExcel = () => {
    try {
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

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
      XLSX.writeFile(workbook, 'products_export.xlsx');
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      return false;
    }
  };

  const importProductsFromExcel = async (file: File): Promise<boolean> => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
      
      const productsToImport: ProductImport[] = jsonData.map(row => ({
        name: row.Name || row.name,
        category: row.Category || row.category,
        actualPrice: Number(row['Actual Price'] || row.actualPrice || 0),
        offerPrice: Number(row['Offer Price'] || row.offerPrice || 0),
        discount: Number(row['Discount %'] || row.discount || 0),
        content: row.Content || row.content || '',
        stock: Number(row.Stock || row.stock || 0),
        description: row.Description || row.description || '', // can be HTML or text
        order: row.Order !== undefined ? Number(row.Order) : null, // support order column
      }));
      
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name');
      
      const categoryMap = new Map();
      categories?.forEach(cat => categoryMap.set(cat.name.toLowerCase(), cat.id));
      
      for (const product of productsToImport) {
        const categoryId = categoryMap.get(product.category.toLowerCase());
        
        if (!categoryId) {
          const { data: newCategory } = await supabase
            .from('categories')
            .insert({ name: product.category })
            .select('id')
            .single();
            
          if (newCategory) {
            categoryMap.set(product.category.toLowerCase(), newCategory.id);
          }
        }
        
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
            description: product.description,
            order: product.order,
          });
      }
      
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