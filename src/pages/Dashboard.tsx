import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Package,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package as PackageIcon,
  Calendar,
  Search
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

export function Dashboard() {
  const [dateRange, setDateRange] = useState('week');
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalUsers: 0,
    totalRevenue: 0,
    totalProfit: 0
  });
  const [salesData, setSalesData] = useState({
    labels: [],
    datasets: []
  });
  const [categoryData, setCategoryData] = useState({
    labels: [],
    datasets: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      // Get date range
      const startDate = dateRange === 'week' 
        ? startOfWeek(new Date()) 
        : startOfMonth(new Date());
      const endDate = dateRange === 'week'
        ? endOfWeek(new Date())
        : endOfMonth(new Date());

      // Fetch orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (ordersError) throw ordersError;

      // Fetch users
      const { data: users, error: usersError } = await supabase
        .from('auth.users')
        .select('*');

      if (usersError) throw usersError;

      // Calculate stats
      const revenue = orders?.reduce((sum, order) => sum + order.total_amount, 0) || 0;
      const profit = revenue * 0.2; // Assuming 20% profit margin

      setStats({
        totalOrders: orders?.length || 0,
        totalUsers: users?.length || 0,
        totalRevenue: revenue,
        totalProfit: profit
      });

      // Prepare sales data
      const salesByDate = orders?.reduce((acc, order) => {
        const date = format(new Date(order.created_at), 'MMM dd');
        acc[date] = (acc[date] || 0) + order.total_amount;
        return acc;
      }, {});

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

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-heading text-4xl mb-4">Dashboard</h1>
          <div className="flex items-center space-x-4">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-card border border-card-border/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary-orange"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text/60">Total Orders</p>
                <h3 className="text-2xl font-bold">{stats.totalOrders}</h3>
              </div>
              <div className="bg-primary-orange/10 p-3 rounded-full">
                <ShoppingCart className="w-6 h-6 text-primary-orange" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+12%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text/60">Total Users</p>
                <h3 className="text-2xl font-bold">{stats.totalUsers}</h3>
              </div>
              <div className="bg-primary-yellow/10 p-3 rounded-full">
                <Users className="w-6 h-6 text-primary-yellow" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+5%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text/60">Total Revenue</p>
                <h3 className="text-2xl font-bold">₹{stats.totalRevenue.toFixed(2)}</h3>
              </div>
              <div className="bg-primary-red/10 p-3 rounded-full">
                <DollarSign className="w-6 h-6 text-primary-red" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+18%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text/60">Total Profit</p>
                <h3 className="text-2xl font-bold">₹{stats.totalProfit.toFixed(2)}</h3>
              </div>
              <div className="bg-green-500/10 p-3 rounded-full">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
            </div>
            <div className="flex items-center text-sm">
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-500">+15%</span>
              <span className="text-text/60 ml-2">vs last {dateRange}</span>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="card">
            <h3 className="font-montserrat font-bold text-xl mb-6">Sales Overview</h3>
            <Line
              data={salesData}
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
          </div>

          <div className="card">
            <h3 className="font-montserrat font-bold text-xl mb-6">Category Distribution</h3>
            <div className="aspect-square max-w-[300px] mx-auto">
              <Doughnut
                data={categoryData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link to="/orders" className="card hover:border-primary-orange group">
            <div className="flex items-center space-x-4">
              <div className="bg-primary-orange/10 p-4 rounded-full group-hover:bg-primary-orange/20 transition-colors">
                <ShoppingCart className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg">Manage Orders</h3>
                <p className="text-text/60">View and manage all orders</p>
              </div>
            </div>
          </Link>

          <Link to="/stock" className="card hover:border-primary-orange group">
            <div className="flex items-center space-x-4">
              <div className="bg-primary-orange/10 p-4 rounded-full group-hover:bg-primary-orange/20 transition-colors">
                <PackageIcon className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg">Stock Management</h3>
                <p className="text-text/60">Update product inventory</p>
              </div>
            </div>
          </Link>

          <Link to="/analytics" className="card hover:border-primary-orange group">
            <div className="flex items-center space-x-4">
              <div className="bg-primary-orange/10 p-4 rounded-full group-hover:bg-primary-orange/20 transition-colors">
                <TrendingUp className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg">Analytics</h3>
                <p className="text-text/60">View detailed analytics</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}