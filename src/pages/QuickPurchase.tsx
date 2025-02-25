import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { products } from '../data/products';
import { useCartStore } from '../store/cartStore';
import { Cart } from '../components/Cart';

export function QuickPurchase() {
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleQuantityChange = (productId: number, quantity: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
    addToCart(
      products.find((p) => p.id === productId)!,
      quantity
    );
  };

  // Group products by category
  const groupedProducts = products.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = [];
    }
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, typeof products>);

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
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-14 h-14 object-cover rounded-lg shadow-md"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-montserrat font-bold text-sm truncate">{product.name}</h3>
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