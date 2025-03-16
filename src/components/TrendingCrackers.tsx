import { motion } from "framer-motion";
import {
  ArrowRight,
  Star,
  Plus,
  Minus,
  ShoppingCart,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCartStore } from "../store/cartStore";
import { useProducts } from "../hooks/useProducts";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function TrendingCrackers() {
  const { addToCart } = useCartStore();
  const { products, loading: productsLoading } = useProducts();
  const [trendingProducts, setTrendingProducts] = useState(products);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [productStock, setProductStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (products.length > 0) {
      // Get first 4 products for trending section
      const trending = products.slice(0, 4);
      setTrendingProducts(trending);

      // Initialize quantities
      const newQuantities: Record<string, number> = {};
      trending.forEach(p => {
        newQuantities[p.id] = quantities[p.id] || 0;
      });
      setQuantities(newQuantities);

      // Fetch real-time stock data
      const stockSubscription = supabase
        .channel('product-stock')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `id=in.(${trending.map(p => p.id).join(',')})`,
        }, (payload) => {
          if (payload.new) {
            setProductStock(prev => ({
              ...prev,
              [payload.new.id]: payload.new.stock
            }));
          }
        })
        .subscribe();

      // Initial stock fetch
      const fetchStock = async () => {
        try {
          const { data, error } = await supabase
            .from('products')
            .select('id, stock')
            .in('id', trending.map(p => p.id));

          if (error) throw error;

          const stockMap: Record<string, number> = {};
          data.forEach(item => {
            stockMap[item.id] = item.stock;
          });
          setProductStock(stockMap);
        } catch (error) {
          console.error('Error fetching stock:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchStock();

      return () => {
        stockSubscription.unsubscribe();
      };
    }
  }, [products]);

  const handleQuantityChange = (productId: string, value: string) => {
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));
  };

  const handleIncrement = (product: any) => {
    const stock = productStock[product.id];
    if (stock !== undefined && stock <= 0) {
      return;
    }

    const currentQuantity = quantities[product.id] || 0;
    const newQuantity = currentQuantity + 1;
    setQuantities((prev) => ({ ...prev, [product.id]: newQuantity }));
    addToCart(product, 1);
  };

  const handleDecrement = (product: any) => {
    const currentQuantity = quantities[product.id] || 0;
    if (currentQuantity > 0) {
      const newQuantity = currentQuantity - 1;
      setQuantities((prev) => ({ ...prev, [product.id]: newQuantity }));
      addToCart(product, -1);
    }
  };

  const handleAddToCart = (product: any) => {
    const stock = productStock[product.id];
    if (stock !== undefined && stock <= 0) {
      return;
    }
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    addToCart(product, 1);
  };

  if (productsLoading || loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

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
              className="card group p-3 flex flex-col"
            >
              <div className="relative mb-4 overflow-hidden rounded-lg">
                <Link to={`/product/${product.id}`}>
                  <img
                    src={product.image_url ? `/assets/img/crackers/${product.image_url}` : `/assets/img/logo/logo_2.png`}
                    alt={product.name}
                    className="w-full h-50 object-cover transform group-hover:scale-110 transition-transform duration-500"
                  />
                </Link>
                <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                  {product.discount_percentage}% OFF
                </div>
                {productStock[product.id] !== undefined && productStock[product.id] <= 0 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                      OUT OF STOCK
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <Link to={`/product/${product.id}`}>
                  <h3 className="font-montserrat font-bold text-lg mb-1">
                    {product.name}
                  </h3>
                </Link>
                <p className="text-sm text-text/60 mb-1">
                  {product.categories.name}
                </p>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-text/60">{product.content}</p>
                  <div>
                    <p className="text-sm text-text/60 line-through">
                      ₹{product.actual_price}
                    </p>
                    <p className="font-bold text-primary-orange">
                      ₹{product.offer_price}
                    </p>
                  </div>
                </div>
                <div className="mt-auto">
                  {quantities[product.id] ? (
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleDecrement(product)}
                        className="p-1 rounded-lg bg-card hover:bg-card/70 transition-colors"
                        aria-label="Decrease quantity"
                        disabled={productStock[product.id] !== undefined && productStock[product.id] <= 0}
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
                        disabled={productStock[product.id] !== undefined && productStock[product.id] <= 0}
                      />
                      <button
                        onClick={() => handleIncrement(product)}
                        className="p-1 rounded-lg bg-card hover:bg-card/70 transition-colors"
                        aria-label="Increase quantity"
                        disabled={productStock[product.id] !== undefined && productStock[product.id] <= 0}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(product)}
                      className={`btn-primary w-full flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors ${
                        productStock[product.id] !== undefined && productStock[product.id] <= 0
                          ? "bg-red-500/10 text-white-500 cursor-not-allowed"
                          : "bg-primary-orange text-white hover:bg-primary-red"
                      }`}
                      disabled={productStock[product.id] !== undefined && productStock[product.id] <= 0}
                    >
                      {productStock[product.id] !== undefined && productStock[product.id] <= 0 ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span>Out of Stock</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          <span>Add to Cart</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}