import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Line, Pie, Bar } from 'react-chartjs-2';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2, TrendingUp, Users, Package, DollarSign } from 'lucide-react';

interface AnalyticsData {
  citySales: {
    labels: string[];
    data: number[];
  };
  stateSales: {
    labels: string[];
    data: number[];
  };
  productSales: {
    labels: string[];
    quantities: number[];
    revenue: number[];
  };
  categorySales: {
    labels: string[];
    quantities: number[];
    revenue: number[];
  };
  monthlyRevenue: {
    labels: string[];
    data: number[];
  };
  stats: {
    totalRevenue: number;
    totalOrders: number;
    totalProducts: number;
    averageOrderValue: number;
  };
}

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const { userRole } = useAuth();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('month');

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      // Fetch orders with items and products
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          items:order_items (
            *,
            product:products (
              *,
              categories:category_id (*)
            )
          )
        `);

      if (ordersError) throw ordersError;

      // Process city-wise sales
      const cityData = orders.reduce((acc: { [key: string]: number }, order) => {
        const city = order.city || 'Unknown';
        acc[city] = (acc[city] || 0) + order.total_amount;
        return acc;
      }, {});

      // Process state-wise sales
      const stateData = orders.reduce((acc: { [key: string]: number }, order) => {
        const state = order.state || 'Unknown';
        acc[state] = (acc[state] || 0) + order.total_amount;
        return acc;
      }, {});

      // Process product sales
      const productData = orders.reduce((acc: { [key: string]: { qty: number; revenue: number } }, order) => {
        order.items?.forEach(item => {
          const productName = item.product.name;
          if (!acc[productName]) {
            acc[productName] = { qty: 0, revenue: 0 };
          }
          acc[productName].qty += item.quantity;
          acc[productName].revenue += item.total_price;
        });
        return acc;
      }, {});

      // Process category sales
      const categoryData = orders.reduce((acc: { [key: string]: { qty: number; revenue: number } }, order) => {
        order.items?.forEach(item => {
          const categoryName = item.product.categories.name;
          if (!acc[categoryName]) {
            acc[categoryName] = { qty: 0, revenue: 0 };
          }
          acc[categoryName].qty += item.quantity;
          acc[categoryName].revenue += item.total_price;
        });
        return acc;
      }, {});

      // Process monthly revenue
      const monthlyData = orders.reduce((acc: { [key: string]: number }, order) => {
        const month = format(new Date(order.created_at), 'MMM yyyy');
        acc[month] = (acc[month] || 0) + order.total_amount;
        return acc;
      }, {});

      // Calculate stats
      const totalRevenue = orders.reduce((sum, order) => sum + order.total_amount, 0);
      const averageOrderValue = totalRevenue / orders.length || 0;

      setData({
        citySales: {
          labels: Object.keys(cityData),
          data: Object.values(cityData),
        },
        stateSales: {
          labels: Object.keys(stateData),
          data: Object.values(stateData),
        },
        productSales: {
          labels: Object.keys(productData),
          quantities: Object.values(productData).map(p => p.qty),
          revenue: Object.values(productData).map(p => p.revenue),
        },
        categorySales: {
          labels: Object.keys(categoryData),
          quantities: Object.values(categoryData).map(c => c.qty),
          revenue: Object.values(categoryData).map(c => c.revenue),
        },
        monthlyRevenue: {
          labels: Object.keys(monthlyData),
          data: Object.values(monthlyData),
        },
        stats: {
          totalRevenue,
          totalOrders: orders.length,
          totalProducts: new Set(orders.flatMap(o => o.items?.map(i => i.product_id) || [])).size,
          averageOrderValue,
        },
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!['admin', 'superadmin'].includes(userRole?.name || '')) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="font-heading text-4xl">Analytics Dashboard</h1>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'year')}
            className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-montserrat font-bold">Total Revenue</h3>
              <div className="bg-primary-orange/10 p-3 rounded-full">
                <DollarSign className="w-6 h-6 text-primary-orange" />
              </div>
            </div>
            <p className="text-3xl font-bold mb-2">₹{data.stats.totalRevenue.toFixed(2)}</p>
            <p className="text-sm text-text/60">Average order: ₹{data.stats.averageOrderValue.toFixed(2)}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-montserrat font-bold">Total Orders</h3>
              <div className="bg-primary-orange/10 p-3 rounded-full">
                <Package className="w-6 h-6 text-primary-orange" />
              </div>
            </div>
            <p className="text-3xl font-bold mb-2">{data.stats.totalOrders}</p>
            <p className="text-sm text-text/60">Across all categories</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-montserrat font-bold">Products Sold</h3>
              <div className="bg-primary-orange/10 p-3 rounded-full">
                <Package className="w-6 h-6 text-primary-orange" />
              </div>
            </div>
            <p className="text-3xl font-bold mb-2">{data.stats.totalProducts}</p>
            <p className="text-sm text-text/60">Unique products sold</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-montserrat font-bold">Growth</h3>
              <div className="bg-primary-orange/10 p-3 rounded-full">
                <TrendingUp className="w-6 h-6 text-primary-orange" />
              </div>
            </div>
            <p className="text-3xl font-bold mb-2">+15%</p>
            <p className="text-sm text-text/60">From last month</p>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Monthly Revenue Trend */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card rounded-xl p-6"
          >
            <h3 className="font-montserrat font-bold text-xl mb-6">Revenue Trend</h3>
            <Line
              data={{
                labels: data.monthlyRevenue.labels,
                datasets: [{
                  label: 'Revenue',
                  data: data.monthlyRevenue.data,
                  borderColor: '#FF5722',
                  tension: 0.4,
                  fill: true,
                  backgroundColor: 'rgba(255, 87, 34, 0.1)',
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    display: false
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }}
            />
          </motion.div>

          {/* Category Distribution */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card rounded-xl p-6"
          >
            <h3 className="font-montserrat font-bold text-xl mb-6">Category Distribution</h3>
            <Pie
              data={{
                labels: data.categorySales.labels,
                datasets: [{
                  data: data.categorySales.revenue,
                  backgroundColor: [
                    '#FF5722',
                    '#FFC107',
                    '#FF0000',
                    '#8A2BE2',
                    '#4CAF50',
                    '#2196F3'
                  ]
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom'
                  }
                }
              }}
            />
          </motion.div>

          {/* State-wise Sales */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card rounded-xl p-6"
          >
            <h3 className="font-montserrat font-bold text-xl mb-6">State-wise Sales</h3>
            <Bar
              data={{
                labels: data.stateSales.labels,
                datasets: [{
                  label: 'Sales',
                  data: data.stateSales.data,
                  backgroundColor: '#FF5722'
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    display: false
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }}
            />
          </motion.div>

          {/* Product Performance */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-card rounded-xl p-6"
          >
            <h3 className="font-montserrat font-bold text-xl mb-6">Top Products</h3>
            <Bar
              data={{
                labels: data.productSales.labels.slice(0, 10),
                datasets: [
                  {
                    label: 'Quantity Sold',
                    data: data.productSales.quantities.slice(0, 10),
                    backgroundColor: '#FFC107'
                  },
                  {
                    label: 'Revenue',
                    data: data.productSales.revenue.slice(0, 10),
                    backgroundColor: '#FF5722'
                  }
                ]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom'
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}