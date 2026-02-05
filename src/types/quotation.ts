import { Database } from './supabase';
  
  type QuotationDB = Database['public']['Tables']['quotations']['Row'];
  type QuotationItemDB = Database['public']['Tables']['quotation_items']['Row'];
  
  export interface QuotationWithItems extends QuotationDB {
    items: QuotationItemDB[];
  }
  
