import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { Order, OrderItem } from '../types';

type OrderDB = Database['public']['Tables']['orders']['Row'];
type OrderItemDB = Database['public']['Tables']['order_items']['Row'];

interface DeliveryDetails {
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderWithItems extends OrderDB {
  items: OrderItemDB[];
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

  // Start a transaction to update stock and create order
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

  // Update product stock
  for (const item of order.items) {
    // Get current stock
    const { data: product } = await supabase
      .from('products')
      .select('stock')
      .eq('id', item.product_id)
      .single();
    
    if (product) {
      const newStock = Math.max(0, (product.stock || 0) - item.quantity);
      
      // Update stock
      await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id);
    }
  }

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