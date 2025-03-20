import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    if (products.length > 0) {
      // Group products by category
      const grouped = products.reduce((acc, product) => {
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
      products.forEach(p => {
        newQuantities[p.id] = quantities[p.id] || 0;
      });
      setQuantities(newQuantities);
    }
  }, [products]);

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

  if (loading) {
    return (
      <div className="min-h-screen pt-8 pb-12 flex items-center justify-center">
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
              <h1 className="font-heading text-3xl md:text-4xl mb-4">Quick Purchase</h1>
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
                  <span>Checkout</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 max-w-6xl mx-auto">
            {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
              <div key={category} className="mb-6">
                <h2 className="font-montserrat font-bold text-xl mb-3 pl-4 border-l-4 border-primary-orange">
                  {category}
                </h2>
                <div className="space-y-3">
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
                                className="w-16 px-2 py-1 text-center text-sm rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
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
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}