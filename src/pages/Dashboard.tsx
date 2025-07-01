import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Package,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package as PackageIcon,
  Calendar,
  Search,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle
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
import { Line, Doughnut } from 'react-chartjs-2';
import { useDashboard } from '../hooks/useDashboard';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from '../context/AuthContext';

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
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [dateRange, setDateRange] = useState<'week' | 'month'>('week');
  const { stats, salesData, categoryData, loading, fetchDashboardData } = useDashboard();
  const { exportProductsToExcel, importProductsFromExcel } = useProducts();
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState('');

  const isAdmin = ['admin', 'superadmin'].includes(userRole?.name || '');

  if (!isAdmin) {
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

  const handleDateRangeChange = (range: 'week' | 'month') => {
    setDateRange(range);
    fetchDashboardData(range);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportStatus('loading');
      const success = await importProductsFromExcel(file);
      
      if (success) {
        setImportStatus('success');
        setTimeout(() => setImportStatus('idle'), 3000);
      } else {
        setImportStatus('error');
        setImportError('Failed to import products');
      }
    } catch (error) {
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import failed');
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-4xl mb-2">Dashboard</h1>
            <p className="text-text/60">Welcome to your SoundWave Crackers dashboard</p>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <select
              value={dateRange}
              onChange={(e) => handleDateRangeChange(e.target.value as 'week' | 'month')}
              className="bg-card border border-card-border/10 rounded-lg px-4 py-2 focus:outline-none focus:border-primary-orange"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            
            <div className="flex gap-2">
              <button
                onClick={exportProductsToExcel}
                className="flex items-center gap-2 bg-card border border-card-border/10 rounded-lg px-4 py-2 hover:bg-card/70 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export Products</span>
              </button>
              
              <label className="flex items-center gap-2 bg-primary-orange text-white rounded-lg px-4 py-2 hover:bg-primary-red transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Import Products</span>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <button 
            onClick={() => navigate('/orders')}
            className="card hover:border-primary-orange transition-colors"
          >
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
          </button>

          <button 
            onClick={() => navigate('/users')}
            className="card hover:border-primary-orange transition-colors"
          >
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
          </button>

          <button 
            onClick={() => navigate('/orders')}
            className="card hover:border-primary-orange transition-colors"
          >
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
          </button>

          <button 
            onClick={() => navigate('/orders')}
            className="card hover:border-primary-orange transition-colors"
          >
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
          </button>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="card">
            <h3 className="font-montserrat font-bold text-xl mb-6">Sales Overview</h3>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
              </div>
            ) : (
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
            )}
          </div>

          <div className="card">
            <h3 className="font-montserrat font-bold text-xl mb-6">Category Distribution</h3>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
              </div>
            ) : (
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
            )}
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

          <Link to="/expenses" className="card hover:border-primary-orange group">
            <div className="flex items-center space-x-4">
              <div className="bg-primary-orange/10 p-4 rounded-full group-hover:bg-primary-orange/20 transition-colors">
                <DollarSign className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg">Expense Tracking</h3>
                <p className="text-text/60">Manage and track expenses</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}