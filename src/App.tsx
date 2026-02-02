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
import { useTheme } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
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
import { Sitemap } from "./pages/Sitemap";
import { NotFound } from "./pages/NotFound";
import QuickPurchaseButton from "./components/QuickButton";
import { TrackOrder } from "./pages/TrackOrder";
import { Payment } from "./pages/Payment";
import { Expenses } from "./pages/Expenses";
import { UpdatePassword } from "./pages/UpdatePassword";
import { Vendors } from "./pages/Vendors";
import { VendorDetails } from "./pages/VendorDetails";

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

  if (requiredRole === "superadmin") {
    return <Navigate to="/" />;
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
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalQuantity, items } = useCartStore();

  const handleMenuItemClick = () => {
    setIsMobileMenuOpen(false);
  };

  const PRICE_LIST_URL =
    "https://nqlhrwpgdaulwdzgmumv.supabase.co/storage/v1/object/sign/Price%20List/Soundwave%20Crackers%20-%20Price%20List%202025-2.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NTY2MGYwMC1lNzc0LTRiYmItODdlNS1kYzk0YzFlMzIzMzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJQcmljZSBMaXN0L1NvdW5kd2F2ZSBDcmFja2VycyAtIFByaWNlIExpc3QgMjAyNS0yLnBkZiIsImlhdCI6MTc2MzIxMTg4OCwiZXhwIjoxNzk0NzQ3ODg4fQ.NSE-742_GDzgMFP7A6CRg1wmIX-xLWqd58pBEo8Dr2E";

  const handleDownloadPriceList = async () => {
    try {
      const res = await fetch(PRICE_LIST_URL, { method: "GET" });
      if (!res.ok) {
        // fallback: open in new tab
        window.open(PRICE_LIST_URL, "_blank");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Soundwave_Crackers_Price_List_2025.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // fallback open link
      window.open(PRICE_LIST_URL, "_blank");
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
              src="/assets/img/logo/logo_2.png"
              alt="SoundWave Crackers"
              className="hidden dark:block h-20 w-auto dark:invert"
            />
            <img
              src="/assets/img/logo/logo_2.png"
              alt="SoundWave Crackers"
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
            <button
              onClick={handleDownloadPriceList}
              className="font-montserrat font-semibold transition-colors cursor-pointer px-3 py-1 rounded hover:bg-card/60 text-primary"
            >
              Price List
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
            <div className="relative">
              <button onClick={() => setIsCartOpen(true)} className="relative" id="cart-button">
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
              <button
                onClick={() => {
                  handleDownloadPriceList();
                  setIsMobileMenuOpen(false);
                }}
                className="px-4 py-2 font-montserrat font-semibold text-primary hover:text-primary-orange text-left"
              >
                Price List
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
      
      <Route path="/update-password" element={<UpdatePassword />} />
      </Routes>
      <Footer />
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <QuickPurchaseButton />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}
