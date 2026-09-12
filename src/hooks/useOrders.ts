import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { Order } from '../types';

type OrderDB = Database['public']['Tables']['orders']['Row'];
type OrderItemDB = Database['public']['Tables']['order_items']['Row'];

interface DeliveryDetails {
  customerName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  referralPhone: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderWithItems extends OrderDB {
  items: OrderItemDB[];
}

export async function createOrder(order: {
  total_amount: number;
  payment_method: string;
  /** A line is a product or a family pack, never both. */
  items: {
    product_id?: string | null;
    combo_pack_id?: string | null;
    quantity: number;
    price: number;
    total_price: number;
  }[];
  delivery_details: DeliveryDetails;
  /**
   * The season the order is priced from. Analytics filters by this exactly
   * (`orders.season_id`) and falls back to dates only for rolling presets, so
   * an order without it is invisible to every season-scoped report.
   */
  season_id?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  // The order number (SWC-O-<year>-<random>-<seq>) is issued by the database
  // on insert. Working it out here from "the latest order + 1" let two
  // customers checking out together receive the same number.

  // Insert the order; short_id comes back from the database.
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userData.user.id,
      season_id: order.season_id ?? null,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      status: 'Enquiry Received',
      discount_amt: 0,
      discount_percentage: '',
      referred_by: order.delivery_details.referralPhone,
      full_name: order.delivery_details.customerName,
      phone: order.delivery_details.phone,
      email: order.delivery_details.email,
      address: order.delivery_details.address,
      alternate_phone: order.delivery_details.alternatePhone,
      city: order.delivery_details.city,
      district: order.delivery_details.district,
      state: order.delivery_details.state,
      pincode: order.delivery_details.pincode,
      country: order.delivery_details.country,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = order.items.map(item => ({
    order_id: orderData.id,
    ...item
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) throw itemsError;

  // Update product stock
  // for (const item of order.items) {
  //   const { data: product } = await supabase
  //     .from('products')
  //     .select('stock')
  //     .eq('id', item.product_id)
  //     .single();
  //   if (product) {
  //     const newStock = Math.max(0, (product.stock || 0) - item.quantity);
  //     await supabase
  //       .from('products')
  //       .update({ stock: newStock })
  //       .eq('id', item.product_id);
  //   }
  // }

  return orderData;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithItems = await Promise.all(
        ordersData.map(async (order) => {
          const { data: items, error: itemsError } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', order.id);

          if (itemsError) throw itemsError;

          return {
            ...order,
            items: items || []
          };
        })
      );

      setOrders(ordersWithItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;
      
      // Refresh orders
      await fetchOrders();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  return { orders, loading, error, fetchOrders, updateOrderStatus };
}