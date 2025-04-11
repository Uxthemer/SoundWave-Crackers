export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          description: string | null
          image_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          image_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          category_id: string
          name: string
          description: string | null
          image_url: string | null
          actual_price: number
          discount_percentage: number
          offer_price: number
          content: string | null
          stock: number
          created_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          description?: string | null
          image_url?: string | null
          actual_price: number
          discount_percentage?: number
          offer_price: number
          content?: string | null
          stock?: number
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          actual_price?: number
          discount_percentage?: number
          offer_price?: number
          content?: string | null
          stock?: number
          created_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          user_id: string
          total_amount: number
          status: string
          payment_method: string | null
          discount_amt: number
          discount_percentage: string
          referred_by: string | null
          created_at: string
          customer_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          state: string | null
          pincode: string | null
        }
        Insert: {
          id?: string
          user_id: string
          total_amount: number
          status?: string
          payment_method?: string | null
          discount_amt: number
          discount_percentage: string
          referred_by: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          total_amount?: number
          status?: string
          payment_method?: string | null
          discount_amt: number
          discount_percentage: string
          referred_by: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          price: number
          total_price: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          price: number
          total_price: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          price?: number
          total_price?: number
          created_at?: string
        }
      }
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          user_id: string
          role_id: string | null
          full_name: string | null
          email:string | null
          phone: string | null
          address: string | null
          city: string | null
          state: string | null
          pincode: string | null
          country: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role_id?: string | null
          full_name?: string | null
          email:string | null
          phone?: string | null
          address?: string | null
          city: string | null
          state: string | null
          pincode: string | null
          country: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role_id?: string | null
          full_name?: string | null
          email:string | null
          phone?: string | null
          address?: string | null
          city: string | null
          state: string | null
          pincode: string | null
          country: string | null
          created_at?: string
        }
      }
      schemes: {
        Row: {
          id: string
          installment: string
          duration: string
          total_amount: string
          bonus_amount: string
          total_value: string
          features: string[]
          is_active: boolean
          max_participants: number | null
          current_participants: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          installment: string
          duration: string
          total_amount: string
          bonus_amount: string
          total_value: string
          features: string[]
          is_active?: boolean
          max_participants?: number | null
          current_participants?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          installment?: string
          duration?: string
          total_amount?: string
          bonus_amount?: string
          total_value?: string
          features?: string[]
          is_active?: boolean
          max_participants?: number | null
          current_participants?: number
          created_at?: string
          updated_at?: string
        }
      }
      scheme_selections: {
        Row: {
          id: string
          user_id: string
          scheme_id: string
          start_date: string
          end_date: string
          status: 'active' | 'completed' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          scheme_id: string
          start_date: string
          end_date: string
          status: 'active' | 'completed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          scheme_id?: string
          start_date?: string
          end_date?: string
          status?: 'active' | 'completed' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          scheme_selection_id: string
          amount: number
          payment_date: string
          status: 'pending' | 'completed' | 'failed'
          transaction_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scheme_selection_id: string
          amount: number
          payment_date: string
          status: 'pending' | 'completed' | 'failed'
          transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scheme_selection_id?: string
          amount?: number
          payment_date?: string
          status?: 'pending' | 'completed' | 'failed'
          transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}