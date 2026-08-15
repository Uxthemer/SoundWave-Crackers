export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SeasonStatus = 'draft' | 'active' | 'closed'

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
          product_code: string
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
          yt_link: string | null
          product_type: string | null
          apr: number | null
          is_active: boolean | null
          order: number | null
          reorder_level: number | null
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
          season_id: string | null
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
          season_id?: string | null
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
          season_id?: string | null
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
          apr_snapshot: number | null
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          price: number
          total_price: number
          created_at?: string
          apr_snapshot?: number | null
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
          status: 'active' | 'completed' | 'cancelled' | 'delayed'
          created_at: string
          updated_at: string
          amount_paid: number | null
          next_due_date: string | null
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
      },
      quotations: {
        Row: {
          id: string
          short_id: string
          user_id: string | null
          customer_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          state: string | null
          pincode: string | null
          total_amount: number
          created_at: string
          updated_at: string
          season_id: string | null
        }
        Insert: {
          id?: string
          short_id: string
          user_id?: string | null
          customer_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          total_amount: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          short_id?: string
          user_id?: string | null
          customer_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          total_amount?: number
          created_at?: string
          updated_at?: string
        }
      },
      quotation_items: {
        Row: {
          id: string
          quotation_id: string
          product_id: string | null
          quantity: number
          price: number
          total_price: number
          created_at: string
          apr_snapshot: number | null
        }
        Insert: {
          id?: string
          quotation_id: string
          product_id?: string | null
          quantity: number
          price: number
          total_price: number
          created_at?: string
          apr_snapshot?: number | null
        }
        Update: {
          id?: string
          quotation_id?: string
          product_id?: string | null
          quantity?: number
          price?: number
          total_price?: number
          created_at?: string
        }
      },
      seasons: {
        Row: {
          id: string
          code: string
          name: string
          start_date: string
          end_date: string
          status: SeasonStatus
          is_unlocked: boolean
          unlocked_by: string | null
          unlocked_at: string | null
          copied_from: string | null
          created_at: string
          created_by: string | null
          closed_at: string | null
          closed_by: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          start_date: string
          end_date: string
          status?: SeasonStatus
          is_unlocked?: boolean
          copied_from?: string | null
          created_by?: string | null
        }
        Update: {
          code?: string
          name?: string
          start_date?: string
          end_date?: string
          status?: SeasonStatus
          is_unlocked?: boolean
          copied_from?: string | null
        }
      },
      product_seasons: {
        Row: {
          id: string
          season_id: string
          product_id: string
          actual_price: number
          offer_price: number
          discount_percentage: number | null
          content: string | null
          opening_stock: number
          stock: number
          closing_stock: number | null
          reorder_level: number | null
          is_active: boolean
          display_order: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          product_id: string
          actual_price?: number
          offer_price?: number
          discount_percentage?: number | null
          content?: string | null
          opening_stock?: number
          stock?: number
          closing_stock?: number | null
          reorder_level?: number | null
          is_active?: boolean
          display_order?: number | null
        }
        Update: {
          actual_price?: number
          offer_price?: number
          discount_percentage?: number | null
          content?: string | null
          opening_stock?: number
          stock?: number
          closing_stock?: number | null
          reorder_level?: number | null
          is_active?: boolean
          display_order?: number | null
        }
      },
      product_season_costs: {
        Row: {
          season_id: string
          product_id: string
          apr: number | null
          updated_at: string
        }
        Insert: {
          season_id: string
          product_id: string
          apr?: number | null
        }
        Update: {
          apr?: number | null
        }
      },
      season_unlock_log: {
        Row: {
          id: string
          season_id: string
          action: 'unlock' | 'relock'
          actor: string | null
          acted_at: string
        }
        Insert: {
          season_id: string
          action: 'unlock' | 'relock'
          actor?: string | null
        }
        Update: never
      }
    }
    Views: {
      // Joins products (identity) to product_seasons (commercials) and exposes
      // the column names the app used before seasons existed, so most read
      // queries only needed a table-name change plus a season filter.
      season_catalog: {
        Row: {
          id: string
          product_code: string | null
          name: string
          category_id: string | null
          description: string | null
          image_url: string | null
          yt_link: string | null
          product_type: string | null
          product_season_id: string
          season_id: string
          actual_price: number
          offer_price: number
          discount_percentage: number | null
          content: string | null
          stock: number
          opening_stock: number
          closing_stock: number | null
          reorder_level: number | null
          is_active: boolean
          order: number | null
          created_at: string
          categories: {
            id: string
            name: string
            description: string | null
            image_url: string | null
          } | null
        }
      }
    }
    Functions: {
      current_season_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      copy_season_products: {
        Args: {
          p_source_season: string
          p_target_season: string
          p_carry_stock_ids?: string[]
        }
        Returns: number
      }
      close_season: {
        Args: { p_season: string }
        Returns: void
      }
      activate_season: {
        Args: { p_season: string }
        Returns: void
      }
      set_season_unlocked: {
        Args: { p_season: string; p_unlocked: boolean }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}