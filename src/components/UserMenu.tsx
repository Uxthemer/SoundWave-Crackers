import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Settings, ShoppingBag, UserCircle, BarChart2, Package, Building2, CalendarRange, ClipboardList, Boxes, Users, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRoles } from '../hooks/useRoles';
import { DummyInvoiceModal } from './DummyInvoiceModal';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  // Lives here rather than in the dropdown, which closes as the form opens.
  const [showDummyInvoice, setShowDummyInvoice] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | null>(null);

  // The dropdown may be no taller than the room actually left below it. A
  // fixed allowance (100dvh minus 5rem) was right for a desktop header but
  // not a phone's, which is taller, and it ignored the Home / Quick Buy bar
  // fixed to the bottom of small screens -- so on a phone the last entries,
  // Sign Out among them, sat under that bar or off the screen. Measured on
  // open and again whenever the viewport changes: rotation, the address bar
  // showing or hiding, the keyboard.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const el = dropdownRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      // BottomNav in App.tsx: h-16, below the sm breakpoint only.
      const bottomBar = window.matchMedia('(max-width: 639.98px)').matches ? 64 : 0;
      setDropdownMaxHeight(Math.max(160, Math.floor(viewport - top - bottomBar - 8)));
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [isOpen]);
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
        // As wide as its longest item, so no entry wraps onto two lines, and no
        // taller than the room below it (measured above). The name and Sign
        // Out stay put; the list between them scrolls. z-[60] keeps it over
        // the bottom bar, which is z-50.
        <div
          ref={dropdownRef}
          style={dropdownMaxHeight ? { maxHeight: dropdownMaxHeight } : undefined}
          className="absolute right-0 mt-2 w-max min-w-56 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-5rem)] flex flex-col bg-card rounded-lg shadow-lg py-2 z-[60] whitespace-nowrap"
        >
          <div className="px-4 py-2 border-b border-card-border/10 shrink-0">
            <p className="font-montserrat font-bold truncate">{userProfile?.full_name || 'User'}</p>
            <p className="text-sm text-text/60 truncate">{user.email}</p>
            {userRole?.name === 'superadmin' && (
              <p className="text-sm text-primary-orange mt-1">{userRole.name}</p>
            )}
          </div>

          <div className="py-1 flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
                to="/customers"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Users className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Customers</span>
              </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowDummyInvoice(true);
                }}
                className="flex items-center px-4 py-2 w-full text-left hover:bg-card/70 transition-colors"
              >
                <FileText className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Generate Dummy Invoice</span>
              </button>
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
                to="/family-packs"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Boxes className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Family Packs</span>
              </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <Link
                to="/seasons"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <CalendarRange className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Seasons</span>
              </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <Link
                to="/purchasing"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <ClipboardList className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Purchasing</span>
              </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <Link
                to="/vendors"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Building2 className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Vendor Management</span>
              </Link>
            )}

            {(userRole?.name === 'admin' || userRole?.name === 'superadmin') && (
              <Link
                to="/settings"
                className="flex items-center px-4 py-2 hover:bg-card/70 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="w-4 h-4 mr-3 text-primary-orange" />
                <span>Global Settings</span>
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

          <div className="border-t border-card-border/10 py-1 shrink-0">
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

      {/* Portalled out of the nav: its backdrop-blur makes it the containing
          block for anything `fixed` inside it, which would squeeze the form
          into the height of the nav bar. */}
      {showDummyInvoice && (userRole?.name === 'admin' || userRole?.name === 'superadmin') &&
        createPortal(
          <DummyInvoiceModal onClose={() => setShowDummyInvoice(false)} />,
          document.body
        )}
    </div>
  );
}