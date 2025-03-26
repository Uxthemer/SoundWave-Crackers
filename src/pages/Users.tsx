import { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, X, Download, Eye, Loader2, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

interface UserProfile {
  id: string;
  user_id: string;
  role_id: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  created_at: string;
  roles?: {
    name: string;
    description: string;
  };
}

export function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof UserProfile>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const { userRole } = useAuth();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          roles (
            name,
            description
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: keyof UserProfile) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Users Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #FF5722; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .role { 
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.875rem;
          }
          .role-superadmin { background-color: #ffebee; color: #d32f2f; }
          .role-admin { background-color: #fff3e0; color: #f57c00; }
          .role-customer { background-color: #fff8e1; color: #ffa000; }
        </style>
      </head>
      <body>
        <h1>Users Report</h1>
        <p>Generated on: ${format(new Date(), 'PPpp')}</p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Location</th>
              <th>Role</th>
              <th>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            ${filteredUsers.map(user => `
              <tr>
                <td>${user.full_name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${user.city}, ${user.state}</td>
                <td>
                  <span class="role role-${user.roles?.name || 'customer'}">
                    ${user.roles?.name || 'customer'}
                  </span>
                </td>
                <td>${format(new Date(user.created_at), 'MMM dd, yyyy')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.roles?.name === roleFilter;
    return matchesSearch && matchesRole;
  }).sort((a, b) => {
    if (sortField === 'created_at') {
      return sortDirection === 'asc'
        ? new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
        : new Date(b[sortField]).getTime() - new Date(a[sortField]).getTime();
    }
    return sortDirection === 'asc'
      ? String(a[sortField]).localeCompare(String(b[sortField]))
      : String(b[sortField]).localeCompare(String(a[sortField]));
  });

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

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-4xl">Users</h1>
            <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
              {filteredUsers.length} users
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="customer">Customer</option>
            </select>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
            >
              <Printer className="w-5 h-5" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th className="py-4 px-6 text-left">Name</th>
                  <th className="py-4 px-6 text-left">Email</th>
                  <th className="py-4 px-6 text-left">Phone</th>
                  <th className="py-4 px-6 text-left">Location</th>
                  <th className="py-4 px-6 text-left">Role</th>
                  <th className="py-4 px-6 text-left">
                    <button
                      className="flex items-center space-x-1"
                      onClick={() => handleSort('created_at')}
                    >
                      <span>Joined Date</span>
                      {sortField === 'created_at' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text/60">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-t border-card-border/10">
                      <td className="py-4 px-6">{user.full_name}</td>
                      <td className="py-4 px-6">{user.email}</td>
                      <td className="py-4 px-6">{user.phone}</td>
                      <td className="py-4 px-6">
                        {user.city}, {user.state}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          user.roles?.name === 'superadmin'
                            ? 'bg-red-500/10 text-red-500'
                            : user.roles?.name === 'admin'
                            ? 'bg-orange-500/10 text-orange-500'
                            : 'bg-yellow-500/10 text-yellow-500'
                        }`}>
                          {user.roles?.name || 'customer'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {format(new Date(user.created_at), 'MMM dd, yyyy')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}