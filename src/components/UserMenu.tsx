import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, Settings, ShoppingBag, UserCircle, BarChart2, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRoles } from '../hooks/useRoles';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, userProfile, signOut } = useAuth();
  const { userRole } = useRoles();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) {
    return (
      <Link to="/login" className="flex items-center space-x-2 text-primary hover:text-primary-orange transition-colors">
        <User className="w-5 h-5" />
        <span className="hidden md:inline">Sign In</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-primary hover:text-primary-orange transition-colors"
      >
        <UserCircle className="w-6 h-6" />
        <div className="hidden md:block text-left">
          <span className="block">
            {userProfile?.full_name || user.email?.split('@')[0]}
          </span>
          <span className="text-sm text-primary-orange">{userRole}</span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-card-border/10">
            <p className="font-montserrat font-bold truncate">{userProfile?.full_name || 'User'}</p>
            <p className="text-sm text-text/60 truncate">{user.email}</p>
            <p className="text-sm text-primary-orange mt-1">{userRole}</p>
          </div>

          <div className="py-1">
            <Link
              to="/profile"
              className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-4 h-4 mr-3" />
              <span>Profile Settings</span>
            </Link>

            <Link
              to="/orders"
              className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <ShoppingBag className="w-4 h-4 mr-3" />
              <span>My Orders</span>
            </Link>

            {(userRole === 'admin' || userRole === 'superadmin') && (
              <Link
                to="/stock"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Package className="w-4 h-4 mr-3" />
                <span>Stock Management</span>
              </Link>
            )}

            {userRole === 'superadmin' && (
              <Link
                to="/dashboard"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <BarChart2 className="w-4 h-4 mr-3" />
                <span>Dashboard</span>
              </Link>
            )}
          </div>

          <div className="border-t border-card-border/10 py-1">
            <button
              onClick={handleSignOut}
              className="flex items-center px-4 py-2 w-full text-left hover:bg-card/70 transition-colors text-primary-red"
            >
              <LogOut className="w-4 h-4 mr-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}