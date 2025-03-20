import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  LayoutList,
  Filter,
  Plus,
  Minus,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCartStore } from "../store/cartStore";
import { useProducts } from "../hooks/useProducts";
import { useCategories } from "../hooks/useCategories";

export function ExploreCrackers() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const { products, loading: productsLoading } = useProducts();
  const { categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [displayProducts, setDisplayProducts] = useState<any[]>([]);

  // Get category from URL params
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
  }, [searchParams]);

  // Filter products when category or products change
  useEffect(() => {
    if (products.length > 0) {
      let filtered = products;

      if (selectedCategory !== "all") {
        filtered = products.filter(
          (p) =>
            p.categories?.name.toLowerCase() === selectedCategory.toLowerCase()
        );
      }

      const mappedProducts = filtered.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.categories?.name,
        image: p.image_url
          ? `/assets/img/crackers/${p.image_url}`
          : `/assets/img/logo/logo_2.png`,
        actual_price: p.actual_price,
        offer_price: p.offer_price,
        discount: p.discount_percentage,
        content: p.content,
      }));

      setDisplayProducts(mappedProducts);

      // Initialize quantities
      setQuantities((prev) => {
        const newQuantities = { ...prev };
        mappedProducts.forEach((p) => {
          if (newQuantities[p.id] === undefined) {
            newQuantities[p.id] = 0;
          }
        });
        return newQuantities;
      });
    }
  }, [selectedCategory, products]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSearchParams(category === "all" ? {} : { category });
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));
  };

  const handleIncrement = (product: any) => {
     // Check if product is in stock
     if (product.stock !== undefined && product.stock <= 0) {
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
     // Check if product is in stock
     if (product.stock !== undefined && product.stock <= 0) {
      return;
    }
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    addToCart(product, 1);
  };

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    ...categories.map((c) => ({ value: c.name.toLowerCase(), label: c.name })),
  ];

  if (productsLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <div className="pt-6 min-h-screen">
      <div className="sticky top-[0px] left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b border-card-border/10">
        <div className="container mx-auto px-6">
          <div className="py-4">
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
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <ShoppingCart className="w-5 h-5" />
                <span>View Cart</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 mt-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
          <h1 className="font-heading text-4xl">Explore Crackers</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="appearance-none bg-card border border-card-border/10 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:border-primary-orange"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <div className="flex items-center space-x-2 bg-card rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${
                  viewMode === "grid"
                    ? "bg-primary-orange text-white"
                    : "text-text/60"
                }`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${
                  viewMode === "list"
                    ? "bg-primary-orange text-white"
                    : "text-text/60"
                }`}
              >
                <LayoutList className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {displayProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text/60 mb-4">
              No products found in this category.
            </p>
            <button
              onClick={() => handleCategoryChange("all")}
              className="btn-primary"
            >
              View All Products
            </button>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8"
                : "space-y-6"
            }
          >
            {displayProducts.map((product) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`card group p-3 ${
                  viewMode === "list" ? "flex space-x-6" : ""
                }`}
              >
                <div
                  className={`relative overflow-hidden rounded-lg ${
                    viewMode === "list" ? "w-48 flex-shrink-0" : "block mb-4"
                  }`}
                >
                  <Link to={`/product/${product.id}`}>
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-50 object-cover transform group-hover:scale-110 transition-transform duration-500"
                    />
                  </Link>
                  <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                    {product.discount}% OFF
                  </div>
                  {product.stock !== undefined && product.stock <= 0 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                        OUT OF STOCK
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Link to={`/product/${product.id}`}>
                        <h3 className="font-montserrat font-bold text-sm sm:text-xs md:text-sm lg:text-sm">
                          {product.name}
                        </h3>
                      </Link>
                      <p className="text-sm sm:text-xs md:text-sm lg:text-sm text-text/60">{product.category}</p>
                    </div>
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm sm:text-xs md:text-sm lg:text-sm text-text/80 mb-4">
                      {product.content}
                    </p>
                    <div className="text-right">
                      <p className="text-sm sm:text-xs md:text-sm lg:text-sm text-text/60 line-through">
                        ₹{product.actual_price}
                      </p>
                      <p className="font-bold text-primary-orange text-lg sm:text-sm md:text-sm lg:text-xl">
                        ₹{product.offer_price}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center ${viewMode !== 'list' ? 'justify-center' : ''}`}>
                    {/* <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full text-sm">
                      {product.discount}% OFF
                    </span> */}
                    {quantities[product.id] ? (
                      <div className="flex items-center space-x-2 ">
                        <button
                          onClick={() => handleDecrement(product)}
                          className="p-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={quantities[product.id] || 0}
                          onChange={(e) =>
                            handleQuantityChange(product.id, e.target.value)
                          }
                          className="w-16 px-2 py-1 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                          aria-label="Quantity"
                        />
                        <button
                          onClick={() => handleIncrement(product)}
                          className="p-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddToCart(product)}
                        className={`btn-primary ${viewMode !== "list" ? 'w-full' : ''} `}
                      >
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
