import { useState, useEffect, useCallback } from 'react';
  import { supabase } from '../lib/supabase';
  import { QuotationWithItems } from '../types/quotation';
  import { Database } from '../types/supabase';
  import { toast } from 'react-hot-toast';
  // import { useOrders } from './useOrders';
  
  type QuotationInsert = Database['public']['Tables']['quotations']['Insert'];
  type QuotationItemInsert = Database['public']['Tables']['quotation_items']['Insert'];
  
  export function useQuotations() {
    const [quotations, setQuotations] = useState<QuotationWithItems[]>([]);
    const [loading, setLoading] = useState(false);
    // const { createOrder } = useOrders(); // Removed: not returned by hook
  
  // Note: createOrder is a standalone function, we will import it where needed or use it here if we implement convert logic here.
  // actually convert logic is likely better in the component or a dedicated function.
  // For now let's just remove the unused import.
  
    const fetchQuotations = useCallback(async () => {
      setLoading(true);
      try {
        const { data: quotes, error: quotesError } = await supabase
          .from('quotations')
          .select('*')
          .order('created_at', { ascending: false });
  
        if (quotesError) throw quotesError;
  
        const quotesWithItems = await Promise.all(
          quotes.map(async (quote) => {
            const { data: items, error: itemsError } = await supabase
              .from('quotation_items')
              .select('*, product:products(*)') // fetch product details
              .eq('quotation_id', quote.id);
  
            if (itemsError) throw itemsError;
            return { ...quote, items: items || [] };
          })
        );
  
        setQuotations(quotesWithItems);
      } catch (error) {
        console.error('Error fetching quotations:', error);
        toast.error('Failed to fetch quotations');
      } finally {
        setLoading(false);
      }
    }, []);
  
    const saveQuotation = async (
      quotationData: Omit<QuotationInsert, 'id' | 'created_at' | 'updated_at' | 'short_id' | 'user_id'>,
      items: Omit<QuotationItemInsert, 'id' | 'quotation_id' | 'created_at'>[],
      existingId?: string
    ) => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
  
        let quotationId = existingId;
  
        if (existingId) {
          // Update existing
          const { error: updateError } = await supabase
            .from('quotations')
            .update({
              ...quotationData,
              user_id: user.id,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingId);
  
          if (updateError) throw updateError;
  
          // Delete old items to replace with new ones
          const { error: deleteItemsError } = await supabase
            .from('quotation_items')
            .delete()
            .eq('quotation_id', existingId);
          
          if (deleteItemsError) throw deleteItemsError;
  
        } else {
          // Create new
          // Generate short_id
           const { data: lastQuote } = await supabase
            .from('quotations')
            .select('short_id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
  
          let nextNumber = 1;
          if (lastQuote && lastQuote.short_id) {
            const match = lastQuote.short_id.match(/QT-(\d+)/);
            if (match) {
              nextNumber = parseInt(match[1], 10) + 1;
            }
          }
          const shortId = `QT-${String(nextNumber).padStart(3, "0")}`;
  
          const { data: newQuote, error: insertError } = await supabase
            .from('quotations')
            .insert({
              ...quotationData,
              short_id: shortId,
              user_id: user.id
            })
            .select()
            .single();
  
          if (insertError) throw insertError;
          quotationId = newQuote.id;
        }
  
        if (!quotationId) throw new Error('Failed to get quotation ID');
  
        // Insert items
        const { error: itemsInsertError } = await supabase
          .from('quotation_items')
          .insert(items.map(item => ({ ...item, quotation_id: quotationId })));
  
        if (itemsInsertError) throw itemsInsertError;
  
        toast.success(existingId ? 'Quotation updated successfully' : 'Quotation saved successfully');
        fetchQuotations();
        return quotationId;
      } catch (error) {
        console.error('Error saving quotation:', error);
        toast.error('Failed to save quotation');
        throw error;
      } finally {
        setLoading(false);
      }
    };
  
    const deleteQuotation = async (id: string) => {
      if (!confirm('Are you sure you want to delete this quotation?')) return;
      
      setLoading(true);
      try {
        const { error } = await supabase
          .from('quotations')
          .delete()
          .eq('id', id);
  
        if (error) throw error;
        
        toast.success('Quotation deleted');
        fetchQuotations();
      } catch (error) {
        console.error('Error deleting quotation:', error);
        toast.error('Failed to delete quotation');
      } finally {
        setLoading(false);
      }
    };
  
    return {
      quotations,
      loading,
      fetchQuotations,
      saveQuotation,
      deleteQuotation
    };
  }
  
