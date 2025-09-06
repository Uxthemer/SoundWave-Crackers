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
  Search,
  Youtube,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCartStore } from "../store/cartStore";
import { useProducts } from "../hooks/useProducts";
import { useCategories } from "../hooks/useCategories";
import { Cart } from "../components/Cart";
import { ProductImageSlider } from "../components/ProductImageSlider";
import { boolean } from "zod";

export function ExploreCrackers() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const { products, loading: productsLoading } = useProducts();
  const { categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [displayProducts, setDisplayProducts] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  // Get category from URL params
  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
  }, [searchParams]);

  // Filter products when category, products, or search term changes
  useEffect(() => {
    if (products.length > 0) {
      let filtered = products;

      // Apply category filter
      if (selectedCategory !== "all") {
        filtered = filtered.filter(
          (p) =>
            p.categories?.name.toLowerCase() === selectedCategory.toLowerCase()
        );
      }

      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.categories?.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      const mappedProducts = filtered.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.categories?.name,
        image: p.image_url
          ? p.image_url
              .split(",")
              .map((img: string) => `/assets/img/crackers/${img.trim()}`)
          : [`/assets/img/logo/logo-product.png`],
        actual_price: p.actual_price,
        offer_price: p.offer_price,
        discount: p.discount_percentage,
        content: p.content,
        stock: p.stock,
        yt_link: p.yt_link,
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
  }, [selectedCategory, products, searchTerm]);

  // set initial quntities from cart items if exists
  useEffect(() => {
    if (items.length > 0) {
      const initialQuantities: Record<string, number> = {};
      items.forEach((item) => {
        initialQuantities[item.id] = item.quantity;
      });
      setQuantities(initialQuantities);
    }
  }, [items]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSearchParams(category === "all" ? {} : { category });
  };

  const handleQuantityChange = (product: any, value: string) => {
    // Check if product is in stock
    if (product.stock !== undefined && product.stock <= 0) {
      return;
    }
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({ ...prev, [product.id]: newQuantity }));

    const currentQty = quantities[product.id] || 0;
    const quantityChange = newQuantity - currentQty;
    addToCart(product, quantityChange);
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

  // check if product already exists in cart
  const productInCart = (productId: string) => {
    return items.some((item) => item.id === productId);
  };

  // check if product is already in cart and has quantity greater than 0 then return quantity
  const getProductQuantityFromCart = (productId: string) => {
    const item = items.find((item) => item.id === productId);
    return item ? item.quantity : 0;
  };

  const openVideoModal = (videoUrl: string) => {
    setVideoUrl(videoUrl);
    setIsVideoModalOpen(true);
  };

  if (productsLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <>
      <div className="pt-6 min-h-screen">
        <div className="sticky top-[89px] left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b border-card-border/10">
          <div className="container mx-auto px-2 md:px-6">
            <div className="py-2">
              <div className="flex flex-wrap items-center gap-2 bg-card/50 p-2 rounded-xl">
                <div className="flex-1 min-w-[100px] text-center">
                  <p className="text-sm text-text/60">Products</p>
                  <p className="font-montserrat font-bold text-l md:text-xl">
                    {items.length}
                  </p>
                </div>
                <div className="flex-1 min-w-[100px] text-center">
                  <p className="text-sm text-text/60">Quantity</p>
                  <p className="font-montserrat font-bold text-l md:text-xl">
                    {totalQuantity}
                  </p>
                </div>
                <div className="flex-1 min-w-[100px] text-center">
                  <p className="text-sm text-text/60">Amount</p>
                  <p className="font-montserrat font-bold text-l md:text-xl text-primary-orange">
                    ₹{totalAmount.toFixed(2)}
                  </p>
                </div>
                <button
                  className="hidden md:flex btn-primary flex items-center gap-2 md:w-auto"
                  onClick={() => setIsCartOpen(true)}
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span className="hidden md:block">View Cart</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-3 md:px-6 py-8 mt-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
            <h1 className="font-heading text-4xl">Explore Crackers</h1>
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <input
                  type="search"
                  placeholder="Search products or categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-10 py-2 rounded-lg bg-card/30 border-2 border-card-border/30 focus:outline-none focus:border-primary-orange"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="appearance-none bg-card border-2 border-card-border/30 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:border-primary-orange"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((option) => (
                      <option key={option.id} value={option.name.toLowerCase()}>
                        {option.name}
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
          </div>

          {displayProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text/60 mb-4">No products found.</p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  handleCategoryChange("all");
                }}
                className="btn-primary"
              >
                View All Products
              </button>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-6"
                  : "space-y-6"
              }
            >
              {displayProducts.map((product) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`card group p-2 ${
                    viewMode === "list" ? "flex space-x-2 md:space-x-6" : ""
                  }`}
                  style={
                    viewMode !== "list"
                      ? { display: "flex", flexDirection: "column", height: "100%" }
                      : {}
                  }
                >
                  <div
                    className={`relative overflow-hidden rounded-lg ${
                      viewMode === "list"
                        ? "w-24 h-24 md:w-48 md:h-auto flex-shrink-0"
                        : "block mb-4"
                    }`}
                  >
                    <Link to={`/product/${product.id}`}>
                      {product.image && product.image.length >= 2 ? (
                        <ProductImageSlider
                          images={product.image}
                          alt={product.name}
                          className="w-full h-50 object-cover rounded-lg"
                        />
                      ) : (
                        <img
                          src={
                            product.image[0] ||
                            `/assets/img/logo/logo-product.png`
                          }
                          alt={product.name}
                          className="w-full h-50 object-cover rounded-lg transform group-hover:scale-110 transition-transform duration-500"
                        />
                      )}
                    </Link>
                    {product.discount > 0 && <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm z-[1]">
                      {product.discount}% OFF
                    </div>}
                    {
                      product.yt_link && (
                        <button
                          onClick={() => openVideoModal(product.yt_link)}
                          className="absolute bottom-2 right-2 text-left hover:text-red w-7 h-6 flex items-center justify-center bg-white/80 rounded-md transition-colors"
                          aria-label="Youtube"
                          title="Watch video in youtube"
                        >
                          <Youtube className="w-6 h-6 text-red-500 hover:fill-red-500 hover:text-black" />
                        </button>
                      )}
                    {product.stock !== undefined && product.stock <= 0 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                          OUT OF STOCK
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <Link to={`/product/${product.id}`}>
                            <h3 className="font-montserrat font-bold text-sm sm:text-xs md:text-sm lg:text-sm">
                              {product.name}
                            </h3>
                          </Link>
                          <p className="text-sm sm:text-xs md:text-sm lg:text-sm text-text/60">
                            {product.category}
                          </p>
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
                    </div>
                    <div
                      className={`flex items-center mt-auto ${
                        viewMode !== "list"
                          ? "justify-center"
                          : "justify-center md:justify-end w-full md:w-auto"
                      }`}
                    >
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
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={quantities[product.id] || 0}
                            onChange={(e) =>
                              handleQuantityChange(product, e.target.value)
                            }
                            className="quantity-input"
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
                          className={`btn-primary ${
                            viewMode !== "list" ? "w-full" : "w-full md:w-auto"
                          } `}
                          style={{ marginTop: "auto" }}
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
      <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      {isVideoModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setIsVideoModalOpen(false)}
        >
          <div className="relative w-full max-w-3xl max-w-[80vw] max-h-[80vh] h-full">
            <button
              className="absolute top-4 right-4 text-white text-2xl"
              onClick={() => setIsVideoModalOpen(false)}
            >
              &times;
            </button>
            <iframe
              className="w-full h-full rounded-lg"
              src={`https://youtube.com/embed/${videoUrl}`}
              title="Product Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking video
            ></iframe>
          </div>
        </div>
      )}
    </>
  );
}
