import { motion } from 'framer-motion';
import { ArrowRight, Star, Plus, Minus, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { products } from '../data/products';
import { useState } from 'react';

export function TrendingCrackers() {
  const { addToCart } = useCartStore();
  const trendingProducts = products.slice(0, 4); // Show first 4 products as trending
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(trendingProducts.map(p => [p.id, 0]))
  );

  const handleQuantityChange = (productId: number, value: string) => {
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities(prev => ({ ...prev, [productId]: newQuantity }));
  };

  const handleIncrement = (product: typeof products[0]) => {
    const newQuantity = (quantities[product.id] || 0) + 1;
    setQuantities(prev => ({ ...prev, [product.id]: newQuantity }));
    addToCart(product, 1);
  };

  const handleDecrement = (product: typeof products[0]) => {
    if (quantities[product.id] > 0) {
      const newQuantity = quantities[product.id] - 1;
      setQuantities(prev => ({ ...prev, [product.id]: newQuantity }));
      addToCart(product, -1);
    }
  };

  const handleAddToCart = (product: typeof products[0]) => {
    const quantity = quantities[product.id] || 0;
    if (quantity > 0) {
      addToCart(product, quantity);
      setQuantities(prev => ({ ...prev, [product.id]: 0 }));
    }
  };

  return (
    <section className="py-16">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-center mb-12">
          <h2 className="font-heading text-4xl">Trending Crackers</h2>
          <Link 
            to="/explore" 
            className="flex items-center space-x-2 text-primary-orange hover:text-primary-red transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {trendingProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="card group"
            >
              <div className="relative mb-4 overflow-hidden rounded-lg">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-48 object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                  {product.discount}% OFF
                </div>
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg mb-1">{product.name}</h3>
                <div className="flex items-center space-x-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-primary-yellow text-primary-yellow"
                    />
                  ))}
                </div>
                <p className="text-sm text-text/60 mb-3">{product.content}</p>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-text/60 line-through">₹{product.actualPrice}</p>
                    <p className="font-bold text-primary-orange">₹{product.offerPrice}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDecrement(product)}
                      className="p-1 rounded-lg bg-card hover:bg-card/70 transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={quantities[product.id] || 0}
                      onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                      className="w-16 px-2 py-1 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      aria-label="Quantity"
                    />
                    <button
                      onClick={() => handleIncrement(product)}
                      className="p-1 rounded-lg bg-card hover:bg-card/70 transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleAddToCart(product)}
                  className={`w-full flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors ${
                    quantities[product.id] > 0
                      ? 'bg-primary-orange text-white hover:bg-primary-red'
                      : 'bg-card/50 text-text/60 hover:bg-card'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Add to Cart</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}