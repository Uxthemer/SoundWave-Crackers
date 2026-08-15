import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { ProductImport } from '../types';
import * as XLSX from 'xlsx';
import { useSeasons } from '../context/SeasonContext';

type CatalogRow = Database['public']['Views']['season_catalog']['Row'];

/**
 * A product as the app has always consumed it: identity fields plus the
 * commercial fields for one season, flattened by the season_catalog view.
 * `id` is still products.id, so it remains a stable key across seasons.
 */
export type ProductWithCategory = CatalogRow;

/**
 * Reads the catalog for one season.
 *
 * @param seasonIdOverride  Admin screens pass the season being worked on.
 *                          Storefront callers omit it and get the active season.
 */
export function useProducts(seasonIdOverride?: string | null) {
  const { activeSeason, loading: seasonsLoading } = useSeasons();
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seasonId = seasonIdOverride ?? activeSeason?.id ?? null;

  const fetchProducts = useCallback(async () => {
    if (!seasonId) {
      // No season resolved yet; stay in loading until one arrives.
      setProducts([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('season_catalog')
        .select('*')
        .eq('season_id', seasonId)
        .eq('is_active', true)
        .order('order', { nullsFirst: false })
        .order('name');

      if (error) throw error;

      setProducts((data as ProductWithCategory[]) || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    fetchProducts();

    if (!seasonId) return;

    // Price and stock now change on product_seasons, so that is what we watch.
    // products still matters for renames and image changes.
    const subscription = supabase
      .channel(`catalog-changes-${seasonId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'product_seasons',
        filter: `season_id=eq.${seasonId}`,
      }, () => {
        fetchProducts();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products',
      }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchProducts, seasonId]);

  const updateProductStock = async (productId: string, stock: number) => {
    if (!seasonId) {
      setError('No season selected');
      return false;
    }

    try {
      const { error } = await supabase
        .from('product_seasons')
        .update({ stock })
        .eq('product_id', productId)
        .eq('season_id', seasonId);

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
        ProductCode: product.product_code,
        Name: product.name,
        Category: product.categories?.name ?? '',
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

  /**
   * Imports a spreadsheet into the given season.
   *
   * Identity (name, category, description) is upserted onto products; the
   * commercial columns land on product_seasons for that season only, so
   * importing a new price list never touches a previous season.
   */
  const importProductsFromExcel = async (
    file: File,
    targetSeasonId?: string
  ): Promise<boolean> => {
    const writeSeasonId = targetSeasonId ?? seasonId;
    if (!writeSeasonId) {
      setError('No season selected for import');
      return false;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const categoryMap = new Map<string, string>();
      categories?.forEach(cat => categoryMap.set(cat.name.toLowerCase(), cat.id));

      for (const product of productsToImport) {
        const categoryKey = product.category?.toLowerCase() ?? '';

        if (!categoryMap.has(categoryKey)) {
          const { data: newCategory } = await supabase
            .from('categories')
            .insert({ name: product.category })
            .select('id')
            .single();

          if (newCategory) {
            categoryMap.set(categoryKey, newCategory.id);
          }
        }

        // Identity: match on name within category, otherwise create.
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('name', product.name)
          .maybeSingle();

        let productId = existing?.id;

        if (!productId) {
          const { data: inserted, error: insertErr } = await supabase
            .from('products')
            .insert({
              name: product.name,
              category_id: categoryMap.get(categoryKey),
              description: product.description,
            })
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          productId = inserted.id;
        } else {
          await supabase
            .from('products')
            .update({
              category_id: categoryMap.get(categoryKey),
              description: product.description,
            })
            .eq('id', productId);
        }

        // Commercials: this season only.
        const { error: seasonErr } = await supabase
          .from('product_seasons')
          .upsert(
            {
              season_id: writeSeasonId,
              product_id: productId,
              actual_price: product.actualPrice,
              offer_price: product.offerPrice,
              discount_percentage: product.discount,
              content: product.content,
              stock: product.stock,
              display_order: product.order,
            },
            { onConflict: 'season_id,product_id' }
          );
        if (seasonErr) throw seasonErr;
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
    loading: loading || seasonsLoading,
    error,
    seasonId,
    fetchProducts,
    updateProductStock,
    exportProductsToExcel,
    importProductsFromExcel
  };
}
