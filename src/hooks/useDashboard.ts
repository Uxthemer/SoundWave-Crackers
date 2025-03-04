import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { DashboardStats } from '../types';

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    totalUsers: 0,
    totalRevenue: 0,
    totalProfit: 0
  });
  
  const [salesData, setSalesData] = useState({
    labels: [] as string[],
    datasets: [{
      label: 'Sales',
      data: [] as number[],
      borderColor: '#FF5722',
      tension: 0.4
    }]
  });
  
  const [categoryData, setCategoryData] = useState({
    labels: [] as string[],
    datasets: [{
      data: [] as number[],
      backgroundColor: [
        '#FF5722',
        '#FFC107',
        '#FF0000',
        '#8A2BE2'
      ]
    }]
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchDashboardData = async (dateRange: 'week' | 'month' = 'week') => {
    try {
      setLoading(true);
      
      // Get date range
      const startDate = dateRange === 'week' 
        ? startOfWeek(new Date()) 
        : startOfMonth(new Date());
      const endDate = dateRange === 'week'
        ? endOfWeek(new Date())
        : endOfMonth(new Date());

      // Fetch orders with realtime subscription
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (ordersError) throw ordersError;

      // Fetch users
      const { count: userCount, error: usersError } = await supabase
        .from('auth.users')
        .select('*', { count: 'exact', head: true });

      if (usersError) throw usersError;

      // Calculate stats
      const revenue = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;
      const profit = revenue * 0.2; // Assuming 20% profit margin

      setStats({
        totalOrders: orders?.length || 0,
        totalUsers: userCount || 0,
        totalRevenue: revenue,
        totalProfit: profit
      });

      // Prepare sales data
      const salesByDate = orders?.reduce((acc, order) => {
        const date = format(new Date(order.created_at), 'MMM dd');
        acc[date] = (acc[date] || 0) + order.total_amount;
        return acc;
      }, {} as Record<string, number>);

      setSalesData({
        labels: Object.keys(salesByDate || {}),
        datasets: [
          {
            label: 'Sales',
            data: Object.values(salesByDate || {}),
            borderColor: '#FF5722',
            tension: 0.4
          }
        ]
      });

      // Fetch category data
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select(`
          name,
          products (
            id
          )
        `);

      if (categoriesError) throw categoriesError;

      setCategoryData({
        labels: categories?.map(cat => cat.name) || [],
        datasets: [{
          data: categories?.map(cat => cat.products.length) || [],
          backgroundColor: [
            '#FF5722',
            '#FFC107',
            '#FF0000',
            '#8A2BE2'
          ]
        }]
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Set up realtime subscription for orders
  useEffect(() => {
    const subscription = supabase
      .channel('orders-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders' 
      }, () => {
        // Refresh dashboard data when orders change
        fetchDashboardData('week');
      })
      .subscribe();
      
    // Initial fetch
    fetchDashboardData('week');
    
    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);
  
  return {
    stats,
    salesData,
    categoryData,
    loading,
    error,
    fetchDashboardData
  };
}