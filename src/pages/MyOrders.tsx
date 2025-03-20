import { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, X, Download, Eye, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  total_price: number;
  product: {
    name: string;
    categories: {
      name: string;
    };
  };
}

interface Order {
  id: string;
  created_at: string;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  total_amount: number;
  status: string;
  payment_method: string;
  items?: OrderItem[];
}

const ORDER_STATUSES = [
  'Order Placed',
  'Processing',
  'Shipped',
  'Dispatched',
  'Delivered',
  'Cancelled'
];

export function MyOrders() {
  const { userRole } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof Order>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(true);

  const isAdmin = ['admin', 'superadmin'].includes(userRole?.name || '');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          items:order_items (
            *,
            product:products (
              name,
              categories:categories (
                name
              )
            )
          )
        `)
        .eq('user_id', userRole?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: keyof Order) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!isAdmin) return;
    
    try {
      setUpdatingStatus(true);
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state
      setOrders(orders.map(order => 
        order.id === orderId ? { ...order, status: newStatus } : order
      ));

      // Update selected order if open
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const exportOrder = (order: Order) => {
    const orderData = {
      'Order ID': order.id,
      'Customer Name': order.customer_name,
      'Email': order.email,
      'Phone': order.phone,
      'Address': order.address,
      'City': order.city,
      'State': order.state,
      'Pincode': order.pincode,
      'Total Amount': order.total_amount,
      'Status': order.status,
      'Payment Method': order.payment_method,
      'Order Date': format(new Date(order.created_at), 'PPpp'),
      'Items': order.items?.map(item => ({
        'Product': item.product.name,
        'Category': item.product.categories.name,
        'Quantity': item.quantity,
        'Price': item.price,
        'Total': item.total_price
      }))
    };

    const ws = XLSX.utils.json_to_sheet([orderData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order Details');
    XLSX.writeFile(wb, `order-${order.id}.xlsx`);
  };

  const exportAllOrders = () => {
    const orderData = orders.map(order => ({
      'Order ID': order.id,
      'Customer Name': order.customer_name,
      'Phone': order.phone,
      'City': order.city,
      'Total Amount': order.total_amount,
      'Status': order.status,
      'Payment Method': order.payment_method,
      'Order Date': format(new Date(order.created_at), 'PPpp'),
      'Items Count': order.items?.length || 0
    }));

    const ws = XLSX.utils.json_to_sheet(orderData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, 'all-orders.xlsx');
  };

  const filteredOrders = orders
    .filter(order => 
      (order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
       order.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       order.city?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === 'all' || order.status === statusFilter)
    )
    .sort((a, b) => {
      if (sortField === 'created_at') {
        return sortDirection === 'asc'
          ? new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
          : new Date(b[sortField]).getTime() - new Date(a[sortField]).getTime();
      }
      return sortDirection === 'asc'
        ? String(a[sortField]).localeCompare(String(b[sortField]))
        : String(b[sortField]).localeCompare(String(a[sortField]));
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Order Placed':
        return 'bg-blue-500/10 text-blue-500';
      case 'Processing':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'Shipped':
        return 'bg-purple-500/10 text-purple-500';
      case 'Dispatched':
        return 'bg-orange-500/10 text-orange-500';
      case 'Delivered':
        return 'bg-green-500/10 text-green-500';
      case 'Cancelled':
        return 'bg-red-500/10 text-red-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="font-heading text-4xl">Orders</h1>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-card border border-card-border/10 rounded-lg focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-card border border-card-border/10 rounded-lg focus:outline-none focus:border-primary-orange"
            >
              <option value="all">All Status</option>
              {ORDER_STATUSES.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            {/* <button
              onClick={exportAllOrders}
              className="flex items-center gap-2 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/80 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export All</span>
            </button> */}
          </div>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort('id')}
                    >
                      <span>Order ID</span>
                      {sortField === 'id' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort('customer_name')}
                    >
                      <span>Customer</span>
                      {sortField === 'customer_name' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-left">Contact</th>
                  <th className="py-4 px-6 text-left">Status</th>
                  <th className="py-4 px-6 text-right">Amount</th>
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort('created_at')}
                    >
                      <span>Date</span>
                      {sortField === 'created_at' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text/60">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="border-t border-card-border/10">
                      <td className="py-4 px-6 font-mono text-sm">{order.id}</td>
                      <td className="py-4 px-6">{order.customer_name}</td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm">{order.phone}</p>
                          <p className="text-sm text-text/60">{order.city}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          disabled={updatingStatus}
                          className={`px-3 py-1 rounded-full text-sm ${getStatusColor(order.status)} bg-opacity-10 border-0 focus:outline-none focus:ring-2 focus:ring-primary-orange`}
                        >
                          {ORDER_STATUSES.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-6 text-right">₹{order.total_amount.toFixed(2)}</td>
                      <td className="py-4 px-6">
                        {format(new Date(order.created_at), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => exportOrder(order)}
                            className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors"
                            title="Export Order"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-background z-10 flex items-center justify-between p-6 border-b border-card-border/10">
              <h2 className="font-heading text-2xl">Order Details</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-card/50 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Order Items */}
              <div className="bg-card/30 rounded-lg overflow-hidden mb-8">
                <table className="w-full">
                  <thead>
                    <tr className="bg-card/50">
                      <th className="py-3 px-4 text-left">Product</th>
                      <th className="py-3 px-4 text-left">Category</th>
                      <th className="py-3 px-4 text-center">Quantity</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item) => (
                      <tr key={item.id} className="border-t border-card-border/10">
                        <td className="py-3 px-4">{item.product.name}</td>
                        <td className="py-3 px-4">{item.product.categories.name}</td>
                        <td className="py-3 px-4 text-center">{item.quantity}</td>
                        <td className="py-3 px-4 text-right">₹{item.price}</td>
                        <td className="py-3 px-4 text-right">₹{item.total_price}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-card-border/10 bg-card/50">
                      <td colSpan={4} className="py-3 px-4 text-right font-bold">Total Amount:</td>
                      <td className="py-3 px-4 text-right font-bold">₹{selectedOrder.total_amount}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-montserrat font-bold text-lg mb-4">Customer Details</h3>
                  <div className="space-y-2">
                    <p><span className="text-text/60">Name:</span> {selectedOrder.customer_name}</p>
                    <p><span className="text-text/60">Email:</span> {selectedOrder.email}</p>
                    <p><span className="text-text/60">Phone:</span> {selectedOrder.phone}</p>
                  </div>
                </div>
                <div>
                  <h3 className="font-montserrat font-bold text-lg mb-4">Delivery Address</h3>
                  <div className="space-y-2">
                    <p>{selectedOrder.address}</p>
                    <p>{selectedOrder.city}, {selectedOrder.state}</p>
                    <p>PIN: {selectedOrder.pincode}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}