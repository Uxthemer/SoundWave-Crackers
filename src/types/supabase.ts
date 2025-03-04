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
          phone: string | null
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role_id?: string | null
          full_name?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role_id?: string | null
          full_name?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
        }
      }
    }
  }
}