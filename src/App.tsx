import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Sparkles, ShoppingCart, Menu, Search, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnnouncementBar } from './components/AnnouncementBar';
import { MarqueeText } from './components/MarqueeText';
import { HeroSlider } from './components/HeroSlider';
import { AboutSection } from './components/AboutSection';
// import { BrandLogos } from './components/BrandLogos';
import { HowItWorks } from "./components/HowItWorks";
import { CrackerCategories } from './components/CrackerCategories';
import { TrendingCrackers } from './components/TrendingCrackers';
import { CompanyScroll } from './components/CompanyScroll';
import { CTASection } from './components/CTASection';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { Cart } from './components/Cart';
import { UserMenu } from './components/UserMenu';
import { QuickPurchase } from './pages/QuickPurchase';
import { ExploreCrackers } from './pages/ExploreCrackers';
import { ProductDetails } from './pages/ProductDetails';
import { Dashboard } from './pages/Dashboard';
import { Orders } from './pages/Orders';
import { StockManagement } from './pages/StockManagement';
import { Login } from './pages/Login'
import { Profile } from './pages/Profile';
import { Payment } from "./pages/Payment";
import { useCartStore } from './store/cartStore';
import CancellationPolicy from './pages/CancellationPolicy';
import ShippingPolicy from './pages/ShippingPolicy';

// Protected route component
const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { user, loading, isSuperUser } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole === 'superuser' && !isSuperUser) {
    return <Navigate to="/" />;
  }
  
  return <>{children}</>;
};

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { totalQuantity } = useCartStore();

  useEffect(() => {
    const handleScroll = () => {
      const isMobile = window.innerWidth < 768;
      setIsScrolled(isMobile && window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <MarqueeText />
      
      {/* Navigation */}
        <nav
          className={`glass-effect w-full z-50 px-4 py-1 ${
            isScrolled ? "md:relative sticky top-[0px]" : "relative"
          }`}
        >
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <img src="/assets/img/logo/logo_2.png" alt='SoundWave Crackers' className="hidden dark:block h-20 w-auto dark:invert" />
            <img src="/assets/img/logo/logo_2.png" alt='SoundWave Crackers' className="block dark:hidden h-20 w-auto light:invert" />
          </Link>
          <div className={`md:flex items-center space-x-8 ${isMobileMenuOpen ? 'flex flex-col absolute top-full left-0 w-full bg-background p-4 space-y-4 md:space-y-0 md:relative md:w-auto md:p-0 md:bg-transparent' : 'hidden md:flex'}`}>
            <Link to="/" className="font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors">Home</Link>
            <Link to="/quick-purchase" className="font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors">Quick Purchase</Link>
            <Link to="/explore" className="font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors">Explore Crackers</Link>
            {/* <Link
                to="/dashboard"
                className="font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dashboard
              </Link> */}
            <Link
                to="/payment"
                className="font-montserrat font-semibold text-primary hover:text-primary-orange transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Payment
              </Link>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="theme-toggle">
              {theme === 'dark' ? (
                <Sun className="w-6 h-6 text-primary-yellow hover:text-primary-yellow/50" />
              ) : (
                <Moon className="w-6 h-6 text-primary-orange hover:text-primary-orange/50" />
              )}
            </button>
            <UserMenu />
            <div className="relative">
              <button onClick={() => setIsCartOpen(true)} className="relative">
                <ShoppingCart className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 cursor-pointer transition-colors" />
                {totalQuantity > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {totalQuantity}
                  </span>
                )}
              </button>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden"
            >
                <Menu className="w-6 h-6 text-primary-orange hover:text-primary-orange/50 cursor-pointer transition-colors" />
            </button>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={
          <>
            <HeroSlider />
            <AboutSection />
            {/* <CompanyScroll /> */}
            <CrackerCategories />
            <TrendingCrackers />
            <CompanyScroll />
            <CTASection />
            <HowItWorks />
            <ContactSection />
          </>
        } />
        <Route path="/quick-purchase" element={<QuickPurchase />} />
        <Route path="/explore" element={<ExploreCrackers />} />
        <Route path="/product/:productId" element={<ProductDetails />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/stock" element={
          <ProtectedRoute>
            <StockManagement />
          </ProtectedRoute>
        } />
        <Route path='/cancellation-policy' element={<CancellationPolicy />}></Route>
        <Route path='/shipping-policy' element={<ShippingPolicy />}></Route>
      </Routes>
      <Footer />
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
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