import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];

interface DeliveryDetails {
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export async function createOrder(order: {
  total_amount: number;
  payment_method: string;
  items: {
    product_id: string;
    quantity: number;
    price: number;
    total_price: number;
  }[];
  delivery_details: DeliveryDetails;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userData.user.id,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      status: 'pending',
      customer_name: order.delivery_details.customerName,
      email: order.delivery_details.email,
      phone: order.delivery_details.phone,
      address: order.delivery_details.address,
      city: order.delivery_details.city,
      state: order.delivery_details.state,
      pincode: order.delivery_details.pincode
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

  return orderData;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      try {
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
    }

    fetchOrders();
  }, []);

  return { orders, loading, error };
}