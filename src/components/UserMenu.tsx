import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Settings, ShoppingBag, UserCircle, BarChart2, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRoles } from '../hooks/useRoles';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, userProfile, userRole, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
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
      <Link to="/login" className="flex items-center space-x-2 text-primary-orange hover:text-primary-orange/50 transition-colors">
        <UserCircle className="w-5 h-5" />
        <span className="hidden md:inline">Sign In</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-primary-orange hover:text-primary-orange/50 transition-colors"
      >
        <UserCircle className="w-6 h-6" />
        <div className="hidden md:block text-left">
          <span className="block text-primary-orange">
            {userProfile?.full_name || user.email?.split('@')[0]}
          </span>
          {userRole?.name === 'superadmin' && (
            <span className="text-sm text-primary-orange/80">{userRole.name}</span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-card-border/10">
            <p className="font-montserrat font-bold truncate">{userProfile?.full_name || 'User'}</p>
            <p className="text-sm text-text/60 truncate">{user.email}</p>
            {userRole?.name === 'superadmin' && (
              <p className="text-sm text-primary-orange mt-1">{userRole.name}</p>
            )}
          </div>

          <div className="py-1">
            <Link
              to="/profile"
              className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-4 h-4 mr-3 text-primary-orange" />
              <span>Profile Settings</span>
            </Link>

            <Link
              to="/myorders"
              className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <ShoppingBag className="w-4 h-4 mr-3 text-primary-orange" />
              <span>My Orders</span>
            </Link>

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
            <Link
              to="/orders"
              className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <ShoppingBag className="w-4 h-4 mr-3 text-primary-orange" />
              <span>All Orders</span>
            </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <Link
                to="/stock"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Package className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Stock Management</span>
              </Link>
            )}

            {userRole?.name === 'superadmin' && (
              <Link
                to="/dashboard"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <BarChart2 className="w-4 h-4 mr-3 text-primary-orange" />
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