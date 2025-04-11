import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCartStore } from "../store/cartStore";
import { Cart } from "../components/Cart";
import { useProducts } from "../hooks/useProducts";
import { useCategories } from "../hooks/useCategories";

export function QuickPurchase() {
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [groupedProducts, setGroupedProducts] = useState<Record<string, any[]>>(
    {}
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [filteredProductCount, setFilteredProductCount] = useState(0);

  useEffect(() => {
    if (products.length > 0) {
      // Initialize all categories as expanded
      const initialExpandState: Record<string, boolean> = {};
      categories.forEach((cat) => {
        initialExpandState[cat.name] = true;
      });
      setExpandedCategories(initialExpandState);

      // Group products by category
      const filtered = products.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.categories?.name
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      );

      setFilteredProductCount(filtered.length);

      const grouped = filtered.reduce((acc, product) => {
        const categoryName = product.categories?.name || "Uncategorized";

        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }

        acc[categoryName].push({
          id: product.id,
          name: product.name,
          category: categoryName,
          image: `${
            product.image_url
              ? `/assets/img/crackers/${product.image_url}`
              : "/assets/img/logo/logo-product.png"
          }`,
          actual_price: product.actual_price,
          offer_price: product.offer_price,
          discount: product.discount_percentage,
          content: product.content,
          stock: product.stock,
        });

        return acc;
      }, {} as Record<string, any[]>);

      setGroupedProducts(grouped);

      // Initialize quantities
      const newQuantities: Record<string, number> = {};
      filtered.forEach((p) => {
        newQuantities[p.id] = quantities[p.id] || 0;
      });
      setQuantities(newQuantities);
    }
  }, [products, searchTerm]);

  const handleQuantityChange = (productId: string, value: string) => {
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));

    const product = Object.values(groupedProducts)
      .flat()
      .find((p) => p.id === productId);

    if (product) {
      const currentQty = quantities[productId] || 0;
      const diff = newQuantity - currentQty;
      if (diff !== 0) {
        addToCart(product, diff);
      }
    }
  };

  const handleIncrement = (productId: string) => {
    const product = Object.values(groupedProducts)
      .flat()
      .find((p) => p.id === productId);

    if (product && (product.stock === undefined || product.stock > 0)) {
      const currentQty = quantities[productId] || 0;
      setQuantities((prev) => ({ ...prev, [productId]: currentQty + 1 }));
      addToCart(product, 1);
    }
  };

  const handleDecrement = (productId: string) => {
    const currentQty = quantities[productId] || 0;
    if (currentQty > 0) {
      const product = Object.values(groupedProducts)
        .flat()
        .find((p) => p.id === productId);

      if (product) {
        setQuantities((prev) => ({ ...prev, [productId]: currentQty - 1 }));
        addToCart(product, -1);
      }
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
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
                <h1 className="font-heading text-3xl md:text-4xl">
                  Quick Purchase
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-card/50 p-4 rounded-xl">
                <div className="flex-1 min-w-[120px] text-center">
                  <p className="text-sm text-text/60">Selected Products</p>
                  <p className="font-montserrat font-bold text-xl">
                    {items.length}
                  </p>
                </div>
                <div className="flex-1 min-w-[120px] text-center">
                  <p className="text-sm text-text/60">Total Quantity</p>
                  <p className="font-montserrat font-bold text-xl">
                    {totalQuantity}
                  </p>
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

          {/* Search Bar */}
          <div className="max-w-6xl mx-auto mt-4">
            <div className="relative">
              <input
                type="search"
                placeholder="Search products or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-10 py-3 rounded-lg bg-card/30 border-2 border-card-border/30 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-text/60">
                {filteredProductCount} products found
              </span>
            </div>
          </div>

          <div className="mt-8 max-w-6xl mx-auto">
            {Object.entries(groupedProducts).map(
              ([category, categoryProducts]) => (
                <div key={category} className="mb-2">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between font-montserrat font-bold text-xl mb-0 pl-4 border-l-4 border-primary-orange bg-primary-orange/10 hover:bg-primary-orange/50 p-2 rounded-t-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>{category}</span>
                      <span className="text-sm text-text/60">
                        ({categoryProducts.length} items)
                      </span>
                    </div>
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
                      className="space-y-1 bg-primary-orange/5 rounded-b-lg p-1"
                    >
                      {categoryProducts.map((product) => (
                        <motion.div
                          key={product.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="bg-card/30 rounded-lg p-3 hover:bg-card/50 transition-colors"
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
                                  <h3 className="font-montserrat font-bold text-sm truncate">
                                    {product.name}
                                  </h3>
                                </Link>
                                <div className="flex flex-wrap gap-2 items-center mt-1">
                                  <span className="text-xs text-text/60">
                                    {product.content}
                                  </span>
                                  <span className="bg-primary-orange/10 text-primary-orange px-2 py-0.5 rounded-full text-xs">
                                    {product.discount}% OFF
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 md:gap-6">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-text/60 line-through">
                                  ₹{product.actual_price}
                                </span>
                                <span className="font-bold text-primary-orange">
                                  ₹{product.offer_price}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                  <button
                                    onClick={() => handleDecrement(product.id)}
                                    className="p-2 rounded-l-lg bg-card hover:bg-card/70 transition-colors"
                                    disabled={!quantities[product.id]}
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={quantities[product.id] || 0}
                                    onChange={(e) =>
                                      handleQuantityChange(
                                        product.id,
                                        e.target.value
                                      )
                                    }
                                    className="w-16 px-2 py-2 text-center border-x border-card-border/10 bg-card"
                                  />
                                  <button
                                    onClick={() => handleIncrement(product.id)}
                                    className="p-2 rounded-r-lg bg-card hover:bg-card/70 transition-colors"
                                    disabled={
                                      product.stock !== undefined &&
                                      product.stock <= 0
                                    }
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="text-right min-w-[80px]">
                                  <p className="text-xs text-text/60">Total</p>
                                  <p className="font-bold text-sm">
                                    ₹
                                    {(
                                      (quantities[product.id] || 0) *
                                      product.offer_price
                                    ).toFixed(2)}
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
              )
            )}
          </div>
        </div>
      </div>
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
