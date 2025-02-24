import { useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, LayoutList, Filter } from 'lucide-react';
import { products } from '../data/products';
import { useCartStore } from '../store/cartStore';

export function ExploreCrackers() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { addToCart } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', ...new Set(products.map(p => p.category))];

  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter(p => p.category === selectedCategory);

  return (
    <div className="pt-24 min-h-screen">
      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
          <h1 className="font-heading text-4xl">Explore Crackers</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-card border border-card-border/10 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:border-primary-orange"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <div className="flex items-center space-x-2 bg-card rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-orange text-white' : 'text-text/60'}`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-orange text-white' : 'text-text/60'}`}
              >
                <LayoutList className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8' : 'space-y-6'}>
          {filteredProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`card ${viewMode === 'list' ? 'flex space-x-6' : ''}`}
            >
              <div className={viewMode === 'list' ? 'w-48 flex-shrink-0' : 'mb-4'}>
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-48 object-cover rounded-lg"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-montserrat font-bold text-xl">{product.name}</h3>
                    <p className="text-sm text-text/60">{product.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-text/60 line-through">₹{product.actualPrice}</p>
                    <p className="font-bold text-primary-orange text-xl">₹{product.offerPrice}</p>
                  </div>
                </div>
                <p className="text-sm text-text/80 mb-4">{product.content}</p>
                <div className="flex items-center justify-between">
                  <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full text-sm">
                    {product.discount}% OFF
                  </span>
                  <button
                    onClick={() => addToCart(product, 1)}
                    className="btn-primary"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}