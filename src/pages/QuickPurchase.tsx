import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Loader2, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { Cart } from '../components/Cart';
import { useProducts } from '../hooks/useProducts';
import { useCategories } from '../hooks/useCategories';

export function QuickPurchase() {
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [groupedProducts, setGroupedProducts] = useState<Record<string, any[]>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (products.length > 0) {
      // Initialize all categories as expanded
      const initialExpandState: Record<string, boolean> = {};
      categories.forEach(cat => {
        initialExpandState[cat.name] = true;
      });
      setExpandedCategories(initialExpandState);

      // Group products by category
      const filtered = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.categories?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const grouped = filtered.reduce((acc, product) => {
        const categoryName = product.categories?.name || 'Uncategorized';
        
        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }
        
        acc[categoryName].push({
          id: product.id,
          name: product.name,
          category: categoryName,
          image: `${product.image_url ? `/assets/img/crackers/${product.image_url}`: '/assets/img/logo/logo_2.png'}`,
          actualPrice: product.actual_price,
          offerPrice: product.offer_price,
          discount: product.discount_percentage,
          content: product.content
        });
        
        return acc;
      }, {} as Record<string, any[]>);
      
      setGroupedProducts(grouped);
      
      // Initialize quantities
      const newQuantities: Record<string, number> = {};
      filtered.forEach(p => {
        newQuantities[p.id] = quantities[p.id] || 0;
      });
      setQuantities(newQuantities);
    }
  }, [products, searchTerm]);

  const handleQuantityChange = (productId: string, quantity: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
    
    const product = Object.values(groupedProducts)
      .flat()
      .find(p => p.id === productId);
      
    if (product) {
      const diff = quantity - (quantities[productId] || 0);
      if (diff !== 0) {
        addToCart(product, diff);
      }
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen pt-6 pb-12">
        <div className="container mx-auto px-4">
          <div className="sticky top-[0px] z-40 bg-background/95 backdrop-blur-sm py-4 border-b border-card-border/10 shadow-sm">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4 items-center mb-4">
                <h1 className="font-heading text-3xl md:text-4xl">Quick Purchase</h1>
                <div className="flex-1 w-full md:w-auto">
                  <div className="relative">
                    <input
                      type="search"
                      placeholder="Search products or categories..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-10 py-2 rounded-lg bg-card/30 border-2 border-card-border/30 focus:outline-none focus:border-primary-orange"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-card/50 p-4 rounded-xl">
                <div className="flex-1 min-w-[120px] text-center">
                  <p className="text-sm text-text/60">Selected Products</p>
                  <p className="font-montserrat font-bold text-xl">{items.length}</p>
                </div>
                <div className="flex-1 min-w-[120px] text-center">
                  <p className="text-sm text-text/60">Total Quantity</p>
                  <p className="font-montserrat font-bold text-xl">{totalQuantity}</p>
                </div>
                <div className="flex-1 min-w-[120px] text-center">
                  <p className="text-sm text-text/60">Total Amount</p>
                  <p className="font-montserrat font-bold text-xl text-primary-orange">
                    ₹{totalAmount.toFixed(2)}
                  </p>
                </div>
                <button 
                  className="btn-primary flex items-center gap-2 w-full md:w-auto"
                  onClick={() => setIsCartOpen(true)}
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>View Cart</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 max-w-6xl mx-auto">
            {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
              <div key={category} className="mb-0 rounded-lg p-1">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between font-montserrat font-bold text-xl mb-0 pl-4 border-l-4 border-primary-orange bg-primary-orange/10 hover:bg-card/80 p-2 rounded-t-lg transition-colors"
                >
                  <span>{category}</span>
                  {expandedCategories[category] ? (
                    <ChevronUp className="w-5 h-5 text-primary-orange" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-primary-orange" />
                  )}
                </button>
                {expandedCategories[category] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-1 bg-primary-orange/10 rounded-b-lg p-1 shadow-sm"
                  >
                    {categoryProducts.map((product) => (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-card/30 rounded-lg p-3 shadow-sm hover:bg-card/50 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <div className="flex items-center gap-3 flex-1">
                            <Link to={`/product/${product.id}`}>
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-14 h-14 object-cover rounded-lg shadow-md"
                              />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <Link to={`/product/${product.id}`}>
                                <h3 className="font-montserrat font-bold text-sm truncate">{product.name}</h3>
                              </Link>
                              <div className="flex flex-wrap gap-2 items-center mt-1">
                                <span className="text-xs text-text/60">{product.content}</span>
                                <span className="bg-primary-orange/10 text-primary-orange px-2 py-0.5 rounded-full text-xs">
                                  {product.discount}% OFF
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 md:gap-6">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-text/60 line-through">₹{product.actualPrice}</span>
                              <span className="font-bold text-primary-orange">₹{product.offerPrice}</span>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={quantities[product.id] || 0}
                                  onChange={(e) =>
                                    handleQuantityChange(product.id, parseInt(e.target.value) || 0)
                                  }
                                  className="quantity-input"
                                />
                              </div>
                              <div className="text-right min-w-[80px]">
                                <p className="text-xs text-text/60">Total</p>
                                <p className="font-bold text-sm">
                                  ₹{((quantities[product.id] || 0) * product.offerPrice).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}