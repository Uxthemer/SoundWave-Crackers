import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Sparkles,
  ShoppingCart,
  Heart,
  Menu,
  X,
  Sun,
  Moon,
  Home,
  User,
  GalleryThumbnails,
  HeartHandshake,
  ChevronDown,
  FileDown,
  Store,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useTheme } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppSettingsProvider, useAppSettings } from "./context/AppSettingsContext";
import { SeasonProvider } from "./context/SeasonContext";
import { AnnouncementBar } from "./components/AnnouncementBar";
import { MarqueeText } from "./components/MarqueeText";
import { HeroSlider } from "./components/HeroSlider";

import { AboutSection } from "./components/AboutSection";
import { HowItWorks } from "./components/HowItWorks";
import { CrackerCategories } from "./components/CrackerCategories";
import { TrendingCrackers } from "./components/TrendingCrackers";
import { CTASection } from "./components/CTASection";
import { ContactSection } from "./components/ContactSection";
import { Footer } from "./components/Footer";
import { Cart } from "./components/Cart";
import { UserMenu } from "./components/UserMenu";
import { QuickPurchase } from "./pages/QuickPurchase";
import { ExploreCrackers } from "./pages/ExploreCrackers";
import { ProductDetails } from "./pages/ProductDetails";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { MyOrders } from "./pages/MyOrders";
import { StockManagement } from "./pages/StockManagement";
import { ComboPacks } from "./pages/ComboPacks";
import { Wishlist } from "./pages/Wishlist";
import { useWishlistStore } from "./store/wishlistStore";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Profile } from "./pages/Profile";
import { ChitScheme } from "./pages/ChitScheme";
import { Wholesale } from "./pages/Wholesale";
import { GlowFrame } from "./components/GlowFrame";
import { useCartStore } from "./store/cartStore";
import CancellationPolicy from "./pages/CancellationPolicy";
import ShippingPolicy from "./pages/ShippingPolicy";
import PrivacyPolicy from "./pages/privacy";
import TermsOfService from "./pages/terms";
import { BlogSection } from "./components/BlogSection";
import { FAQSection } from "./components/FAQSection";
import { BlogPost } from "./pages/BlogPost";
import { Blog } from "./pages/Blog";
import { Users } from "./pages/Users";
import { Analytics } from "./pages/Analytics";
import { AdminSettings } from "./pages/AdminSettings";
import { Sitemap } from "./pages/Sitemap";
import { NotFound } from "./pages/NotFound";
import QuickPurchaseButton from "./components/QuickButton";
import { TrackOrder } from "./pages/TrackOrder";
import { Payment } from "./pages/Payment";
import { Expenses } from "./pages/Expenses";
import { Customers } from "./pages/Customers";
import { UpdatePassword } from "./pages/UpdatePassword";
import { Vendors } from "./pages/Vendors";
import { VendorDetails } from "./pages/VendorDetails";
import { Seasons } from "./pages/Seasons";
import { Purchasing } from "./pages/Purchasing";

// Role ranking so a superadmin satisfies requiredRole="admin".
const ROLE_RANK: Record<string, number> = {
  customer: 0,
  admin: 1,
  superadmin: 2,
};

const ProtectedRoute = ({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: string;
}) => {
  const { user, loading, userRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (requiredRole) {
    // The profile (and therefore the role) can arrive after `loading` clears,
    // so wait rather than bouncing an admin who is still resolving.
    if (!userRole) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      );
    }

    const have = ROLE_RANK[userRole.name] ?? 0;
    const need = ROLE_RANK[requiredRole] ?? 0;
    if (have < need) {
      return <Navigate to="/" />;
    }
  }

  return <>{children}</>;
};

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 flex justify-around items-center h-16 sm:hidden shadow-md z-50">
      <button
        onClick={() => navigate("/")}
        className="flex flex-col items-center text-sm focus:outline-none"
      >
        <Home
          className={`w-5 h-5 ${
            isActive("/")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        />
        <span
          className={`text-xs ${
            isActive("/")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          Home
        </span>
      </button>
      <button
        onClick={() => navigate("/quick-online-cracker")}
        className="flex flex-col items-center text-sm focus:outline-none"
      >
        <ShoppingCart
          className={`w-5 h-5 ${
            isActive("/quick-online-cracker")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        />
        <span
          className={`text-xs ${
            isActive("/quick-online-cracker")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          Quick Buy
        </span>
      </button>
      <button
        onClick={() => navigate("/buy-cracker-online")}
        className="flex flex-col items-center text-sm focus:outline-none"
      >
        <GalleryThumbnails
          className={`w-5 h-5 ${
            isActive("/buy-cracker-online")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        />
        <span
          className={`text-xs ${
            isActive("/buy-cracker-online")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          Explore
        </span>
      </button>
      <button
        onClick={() => navigate("/chit-scheme")}
        className="flex flex-col items-center text-sm focus:outline-none"
      >
        {/* The same highlight as the menu, sized for the bottom bar: a
            gradient icon with a pulsing dot, and the shimmering label. */}
        <span className="relative">
          <HeartHandshake className="w-5 h-5 text-orange-500 chit-menu-sparkle" />
          <span className="absolute -top-0.5 -right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        </span>
        <span className="text-xs font-bold chit-menu-text">Chit</span>
      </button>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}

import { usePageTracking } from "./hooks/usePageTracking";
import { useCanonicalUrl } from "./lib/seo";
import { useForegroundPush } from "./hooks/useForegroundPush";
import { useCartPriceRefresh } from "./hooks/useCartPriceRefresh";

/**
 * "Price List" in the desktop menu: the retail list downloads as before; the
 * wholesale list is an enquiry for now, so it opens the Wholesale page with
 * that enquiry chosen. A dropdown rather than a second menu item -- the row
 * is already full at laptop widths.
 */
function PriceListMenu({ loading, onRetail }: { loading: boolean; onRetail: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 font-montserrat font-semibold transition-colors cursor-pointer px-2 py-1 rounded hover:bg-card/60 text-primary hover:text-primary-orange"
      >
        {loading ? "Preparing…" : "Price List"}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-card-border/20 bg-background shadow-xl py-1.5 z-50">
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRetail();
            }}
            disabled={loading}
            className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-card/70 disabled:opacity-50"
          >
            <FileDown className="w-4 h-4 mt-0.5 text-primary-orange shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Retail price list</span>
              <span className="block text-xs text-text/60">Download the PDF</span>
            </span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/wholesale?type=price-list");
            }}
            className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-card/70"
          >
            <Store className="w-4 h-4 mt-0.5 text-primary-orange shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Wholesale price list</span>
              <span className="block text-xs text-text/60">Request it from our team</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export function AppContent() {
  usePageTracking();
  useCanonicalUrl();
  useForegroundPush();
  useCartPriceRefresh();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalQuantity, items, isCartOpen, openCart, closeCart } = useCartStore();
  const wishlistCount = useWishlistStore((state) => state.items.length);
  const { settings } = useAppSettings();

  const handleMenuItemClick = () => {
    setIsMobileMenuOpen(false);
  };


  const [priceListLoading, setPriceListLoading] = useState(false);

  /**
   * Builds the current price list from the live catalogue and downloads it.
   *
   * It used to fetch a signed URL for a PDF someone had exported and uploaded
   * by hand, so the link showed last year's prices until that was redone.
   */
  const handleDownloadPriceList = async () => {
    if (priceListLoading) return;
    setPriceListLoading(true);
    const pending = toast.loading("Preparing the latest price list…");
    try {
      const { downloadLatestPriceListPdf } = await import(
        "./lib/latestPriceList"
      );
      await downloadLatestPriceListPdf();
      toast.success("Price list downloaded", { id: pending });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not build the price list",
        { id: pending }
      );
    } finally {
      setPriceListLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <MarqueeText />

      {/* Navigation */}
      {/* Full width with slim side padding rather than `container`: that
          capped the row at 1280px and centred it, leaving wide empty margins
          on a desktop while the links sat squeezed together in the middle. */}
      <nav className="glass-effect w-full z-50 px-4 xl:px-6 py-1 sticky top-0">
        <div className="w-full max-w-[1920px] mx-auto flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center -ml-3">
            <img
              src={settings?.logo_url || "/assets/img/logo/logo_2.png"}
              alt={settings?.site_title || "SoundWave Crackers"}
              className="hidden dark:block h-20 xl:h-16 2xl:h-20 w-auto dark:invert"
            />
            <img
              src={settings?.logo_url || "/assets/img/logo/logo_2.png"}
              alt={settings?.site_title || "SoundWave Crackers"}
              className="block dark:hidden h-20 xl:h-16 2xl:h-20 w-auto light:invert"
            />
          </Link>

          {/* Desktop Navigation Links */}
          {/* Room between the links grows with the screen; the type and the
              logo grow with it. Each step was measured against the real
              Montserrat widths, the logo and the right-hand icons (with the
              user's name, cut short in UserMenu), so the row never runs past
              the screen:
                1280px   14px type, 28px gaps, 64px logo, no name
                1440px   14px, 32px gaps, name up to 120px
                1536px   15px, 40px gaps, 80px logo, name up to 140px
                1700px+  16px, 48px gaps
              The links inherit the size from here. */}
          <div className="hidden xl:flex items-center gap-7 min-[1440px]:gap-8 2xl:gap-10 min-[1700px]:gap-12 text-sm 2xl:text-[15px] min-[1700px]:text-base">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/quick-online-cracker"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors animate-bounce cursor-pointer ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Quick Purchase
            </NavLink>
            <NavLink
              to="/buy-cracker-online"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Explore Crackers
            </NavLink>
            {/* A button with light running round its border (index.css,
                .chit-menu-highlight; components/GlowFrame.tsx): the scheme is
                seasonal and the one thing in the menu worth drawing the eye to. */}
            <NavLink
              to="/chit-scheme"
              title="Diwali Chit Scheme — save monthly"
              // NavLink adds `active` on the chit page; the CSS rings it then.
              className="chit-menu-highlight font-montserrat font-bold cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="chit-menu-sparkle" aria-hidden="true" />
              <span>Chit Scheme</span>
              <GlowFrame />
            </NavLink>
            {/* Open to everyone: a guest tracks with the order number and
                the phone they ordered with. It used to be reachable only
                from the footer and the post-checkout screen. */}
            <NavLink
              to="/wholesale"
              title="Wholesale enquiries and price list"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Wholesale
            </NavLink>
            <NavLink
              to="/track-order"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Track Order
            </NavLink>
            <PriceListMenu loading={priceListLoading} onRetail={handleDownloadPriceList} />
          </div>

          <div className="flex items-center space-x-4">
            {/* Below xl this lives in the menu instead — the header row is
                tight on a phone, and the theme is a setting rather than
                something you reach for as often as the cart. */}
            <button
              onClick={toggleTheme}
              className="theme-toggle hidden xl:inline-block"
              id="theme-toggle"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <Sun className="w-6 h-6 text-primary-yellow hover:text-primary-yellow/50" />
              ) : (
                <Moon className="w-6 h-6 text-primary-orange hover:text-primary-orange/50" />
              )}
            </button>
            <UserMenu />
            {/* Saved for later, next to the cart it empties into. */}
            <Link
              to="/wishlist"
              className="relative"
              aria-label={`Wishlist${wishlistCount ? `, ${wishlistCount} saved` : ""}`}
              title="Wishlist"
            >
              <Heart className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 transition-colors" />
              {wishlistCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </Link>
            <div className="relative">
              <button onClick={openCart} className="relative" id="cart-button">
                <ShoppingCart className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 cursor-pointer transition-colors" />
                {items.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {items.length}
                  </span>
                )}
              </button>
            </div>
            {/* Mobile Menu Toggle.

                This was `hidden sm:flex xl:hidden`, so it disappeared below
                640px — every phone. The menu behind it, Track Order and Price
                List included, could not be opened there at all. */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex xl:hidden"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 cursor-pointer transition-colors" />
              ) : (
                <Menu className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 cursor-pointer transition-colors" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile/Tablet Menu */}
        <div
          className={`xl:hidden absolute left-0 right-0 top-full bg-background border-t border-card-border/10 shadow-lg transition-all duration-300 max-h-[calc(100vh-6rem)] overflow-y-auto ${
            isMobileMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
        >
          <div className="container mx-auto py-4">
            <div className="flex flex-col space-y-4">
              <Link
                to="/"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors cursor-pointer"
                onClick={handleMenuItemClick}
              >
                Home
              </Link>
              <Link
                to="/quick-online-cracker"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors cursor-pointer"
                onClick={handleMenuItemClick}
              >
                <motion.span
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
                  style={{ display: "inline-block" }}
                >
                  Quick Purchase
                </motion.span>
              </Link>
              <Link
                to="/buy-cracker-online"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors cursor-pointer"
                onClick={handleMenuItemClick}
              >
                Explore Crackers
              </Link>
              <Link
                title="Diwali Chit Scheme — save monthly"
                to="/chit-scheme"
                className="chit-menu-highlight self-start mx-4 my-1 font-montserrat font-bold cursor-pointer"
                onClick={handleMenuItemClick}
              >
                <Sparkles className="chit-menu-sparkle" aria-hidden="true" />
                <span>Chit Scheme</span>
                <GlowFrame />
              </Link>
              <Link
                to="/wholesale"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors cursor-pointer"
                onClick={handleMenuItemClick}
              >
                Wholesale
              </Link>
              <Link
                to="/track-order"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors"
                onClick={handleMenuItemClick}
              >
                Track Order
              </Link>
              <Link
                to="/wishlist"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors"
                onClick={handleMenuItemClick}
              >
                Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ""}
              </Link>
              <button
                onClick={() => {
                  handleDownloadPriceList();
                  setIsMobileMenuOpen(false);
                }}
                disabled={priceListLoading}
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange text-left disabled:opacity-60 disabled:cursor-wait"
              >
                {priceListLoading ? "Preparing…" : "Retail Price List"}
              </button>
              <Link
                to="/wholesale?type=price-list"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors"
                onClick={handleMenuItemClick}
              >
                Wholesale Price List
              </Link>

              {/* The theme, moved off the header on small screens. The menu
                  deliberately stays open: this changes the page behind it, and
                  closing would hide the thing you just changed. */}
              <button
                onClick={toggleTheme}
                id="theme-toggle-mobile"
                className="flex items-center gap-2 px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors border-t border-card-border/10 pt-4 text-left"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="w-5 h-5 text-primary-yellow" />
                    Light mode
                  </>
                ) : (
                  <>
                    <Moon className="w-5 h-5 text-primary-orange" />
                    Dark mode
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>
      <ScrollToTop />

      {/* Main Content */}
      <Routes>
        <Route
          path="/"
          element={
            <>
              <HeroSlider />
              <div id="about-us" className="scroll-mt-10">
                <AboutSection />
              </div>
              <div id="cracker-categories" className="scroll-mt-28">
                <CrackerCategories />
              </div>
              <div id="trending-crackers" className="scroll-mt-10">
                <TrendingCrackers />
              </div>
              <CTASection />
              <HowItWorks />
              <div id="faqs" className="scroll-mt-10">
                <FAQSection />
              </div>
              <div id="blog" className="scroll-mt-16">
                <BlogSection />
              </div>
              <div id="contact-us" className="scroll-mt-10">
                <ContactSection />
              </div>
            </>
          }
        />
        <Route path="/quick-online-cracker" element={<QuickPurchase />} />
        <Route path="/buy-cracker-online" element={<ExploreCrackers />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/product/:productId" element={<ProductDetails />} />
        <Route path="/chit-scheme" element={<ChitScheme />} />
        <Route path="/wholesale" element={<Wholesale />} />
        {/* The page's old address, kept for links and search results that still point at it. */}
        <Route path="/monthly-installment" element={<Navigate to="/chit-scheme" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/myorders"
          element={
            <ProtectedRoute>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <Orders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <StockManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family-packs"
          element={
            <ProtectedRoute requiredRole="admin">
              <ComboPacks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRole="admin">
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute requiredRole="admin">
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/shipping-policy" element={<ShippingPolicy />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/sitemap" element={<Sitemap />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/payment" element={<Payment />} />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute requiredRole="admin">
              <Expenses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute requiredRole="admin">
              <Customers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors"
          element={
            <ProtectedRoute requiredRole="admin">
              <Vendors />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors/:id"
          element={
            <ProtectedRoute requiredRole="admin">
              <VendorDetails />
            </ProtectedRoute>
          }
        />
        {/* The standalone price-comparison prototype kept its data in
            localStorage and could not feed purchasing. Real comparison now
            lives on the Purchasing page, backed by the saved vendor price
            lists; the old link redirects there. */}
        <Route path="/price-comparing" element={<Navigate to="/purchasing" replace />} />
        <Route
          path="/seasons"
          element={
            <ProtectedRoute requiredRole="admin">
              <Seasons />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchasing"
          element={
            <ProtectedRoute requiredRole="admin">
              <Purchasing />
            </ProtectedRoute>
          }
        />

        <Route path="/update-password" element={<UpdatePassword />} />
      </Routes>
      <Footer />
      <Cart isOpen={isCartOpen} onClose={closeCart} />
      <QuickPurchaseButton />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppSettingsProvider>
          <SeasonProvider>
            <AppContent />
            {/* <DebugSettings /> Uncomment if needed for troubleshooting */}
          </SeasonProvider>
        </AppSettingsProvider>
      </AuthProvider>
    </Router>
  );
}
