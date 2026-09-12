import React, { useState, useEffect } from "react";
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
import { MonthlyInstallment } from "./pages/MonthlyInstallment";
import { useCartStore } from "./store/cartStore";
import CancellationPolicy from "./pages/CancellationPolicy";
import ShippingPolicy from "./pages/ShippingPolicy";
import PrivacyPolicy from "./pages/privacy";
import TermsOfService from "./pages/terms";
import { BlogSection } from "./components/BlogSection";
import { FAQSection } from "./components/FAQSection";
import { BlogPost } from "./pages/BlogPost";
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
        onClick={() => navigate("/monthly-installment")}
        className="flex flex-col items-center text-sm focus:outline-none"
      >
        <HeartHandshake
          className={`w-5 h-5 ${
            isActive("/monthly-installment")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        />
        <span
          className={`text-xs ${
            isActive("/monthly-installment")
              ? "text-orange-500"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          Chit
        </span>
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

export function AppContent() {
  usePageTracking();
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
      <nav className="glass-effect w-full z-50 px-4 py-1 sticky top-0">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center -ml-3">
            <img
              src={settings?.logo_url || "/assets/img/logo/logo_2.png"}
              alt={settings?.site_title || "SoundWave Crackers"}
              className="hidden dark:block h-20 w-auto dark:invert"
            />
            <img
              src={settings?.logo_url || "/assets/img/logo/logo_2.png"}
              alt={settings?.site_title || "SoundWave Crackers"}
              className="block dark:hidden h-20 w-auto light:invert"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden xl:flex items-center space-x-8">
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
            <NavLink
              to="/monthly-installment"
              title="Monthly Installment (Chit)"
              className={({ isActive }) =>
                `font-montserrat font-semibold transition-colors relative shining-text cursor-pointer ${
                  isActive
                    ? "text-primary-orange"
                    : "text-primary hover:text-primary-orange"
                }`
              }
            >
              Chit Scheme
            </NavLink>
            {/* Open to everyone: a guest tracks with the order number and
                the phone they ordered with. It used to be reachable only
                from the footer and the post-checkout screen. */}
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
            <button
              onClick={handleDownloadPriceList}
              disabled={priceListLoading}
              title="Download the current price list"
              className="font-montserrat font-semibold transition-colors cursor-pointer px-3 py-1 rounded hover:bg-card/60 text-primary disabled:opacity-60 disabled:cursor-wait"
            >
              {priceListLoading ? "Preparing…" : "Price List"}
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="theme-toggle" id="theme-toggle">
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
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="hidden sm:flex xl:hidden"
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
          className={`xl:hidden absolute left-0 right-0 top-full bg-background border-t border-card-border/10 shadow-lg transition-all duration-300 ${
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
                title="Monthly Installment (Chit)"
                to="/monthly-installment"
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors shining-text cursor-pointer"
                onClick={handleMenuItemClick}
              >
                Chit Scheme
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
                {priceListLoading ? "Preparing…" : "Price List"}
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
        <Route path="/monthly-installment" element={<MonthlyInstallment />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
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
