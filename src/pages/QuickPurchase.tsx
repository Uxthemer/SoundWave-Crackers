import { useEffect, useState } from "react";
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
import { WishlistButton } from "../components/WishlistButton";
import { useCategories } from "../hooks/useCategories";
import { ProductImageSlider } from "../components/ProductImageSlider";
import { NumberInput } from "../components/NumberInput";
import { crackerImage } from "../lib/productImage";
import {
  CatalogModeSwitch,
  matchesCatalogMode,
  type CatalogMode,
} from "../components/CatalogModeSwitch";

import { useAuth } from "../context/AuthContext"; // Import your auth context

export function QuickPurchase() {
  const { addToCart, items, totalQuantity, totalAmount } = useCartStore();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const { userProfile, userRole } = useAuth(); // Get user profile/role
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [groupedProducts, setGroupedProducts] = useState<Record<string, any[]>>(
    {}
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("all");
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [filteredProductCount, setFilteredProductCount] = useState(0);
  const [modalImage, setModalImage] = useState<{
    src: string[];
    alt: string;
  } | null>(null);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (modalImage) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    // Cleanup on unmount
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [modalImage]);

  useEffect(() => {
    if (products.length > 0 && categories.length > 0) {
      // Initialize all categories as expanded
      const initialExpandState: Record<string, boolean> = {};
      categories.forEach((cat) => {
        initialExpandState[cat.name] = true;
      });
      setExpandedCategories(initialExpandState);

      // Group products by category
      const filtered = products.filter(
        (product) =>
          matchesCatalogMode(product, catalogMode) &&
          (product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.categories?.name
              .toLowerCase()
              .includes(searchTerm.toLowerCase()))
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
          image: product.image_url
            ? product.image_url
                .split(",")
                .map((img: string) => crackerImage(img.trim()))
            : [`/assets/img/logo/logo-product.png`],
          actual_price: product.actual_price,
          offer_price: product.offer_price,
          discount: product.discount_percentage,
          content: product.content,
          stock: product.stock,
          combo_pack_id: product.combo_pack_id ?? null,
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
    // eslint-disable-next-line
  }, [products, categories, searchTerm, catalogMode]);

  // set initial quantities for products in the cart
  useEffect(() => {
    const initialQuantities: Record<string, number> = {};
    items.forEach((item) => {
      initialQuantities[item.id] = item.quantity;
    });
    setQuantities(initialQuantities);
  }, [items]);

  const handleQuantityChange = (productId: string, value: string) => {
    const newQuantity = Math.max(0, parseInt(value) || 0);
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));

    const product = Object.values(groupedProducts)
      .flat()
      .find((p) => p.id === productId);

    if (product) {
      // Measured against the cart itself rather than the local mirror, which
      // can be a render behind the store while someone is typing.
      const currentQty =
        items.find((item) => item.id === productId)?.quantity ?? 0;
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

  /**
   * The discount for a category's header. Every product in a season usually
   * carries the same headline discount, so repeating "90% OFF" on each row
   * was noise; it is said once per section instead. If the products in a
   * section differ, the header says "Up to" the largest.
   */
  const categoryDiscountLabel = (categoryProducts: any[]) => {
    const discounts = categoryProducts
      .map((p) => Number(p.discount) || 0)
      .filter((d) => d > 0);
    if (discounts.length === 0) return null;
    const max = Math.max(...discounts);
    const allSame =
      discounts.length === categoryProducts.length &&
      discounts.every((d) => d === max);
    return `${allSame ? "" : "Up to "}${max}% OFF`;
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
          <div className="sticky top-[25px] z-40 bg-background/95 backdrop-blur-sm py-2 border-b border-card-border/10 shadow-sm">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 items-center mb-4">
                <h1 className="font-heading text-3xl md:text-4xl">
                  Quick Purchase
                </h1>
                <CatalogModeSwitch mode={catalogMode} onChange={setCatalogMode} />
              </div>
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
                  <p className="text-sm text-text/60">Total</p>
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

          {/* Search Bar */}
          <div className="max-w-6xl mx-auto mt-4 px-2">
            <div className="relative flex flex-col md:flex-row md:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="search"
                  placeholder="Search products or categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-10 py-3 rounded-lg bg-card/30 border-2 border-card-border/30 focus:outline-none focus:border-primary-orange"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text/40" />
              </div>
              <span className="text-sm text-text/60 md:ml-4 md:mt-0 mt-1">
                {filteredProductCount} products found
              </span>
            </div>
          </div>

          <div className="mt-4 max-w-6xl mx-auto">
            {/* Only once a filter is on: with neither, the catalogue is not
                empty, and the count is still 0 for the first frame after
                loading. */}
            {filteredProductCount === 0 &&
              (catalogMode === "packs" || searchTerm) && (
              <div className="text-center py-12">
                <p className="text-text/60 mb-4">
                  {catalogMode === "packs"
                    ? "No family packs found."
                    : "No products found."}
                </p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setCatalogMode("all");
                  }}
                  className="btn-primary"
                >
                  View All Products
                </button>
              </div>
            )}
            {Object.entries(groupedProducts).map(
              ([category, categoryProducts]) => (
                <div key={category} className="mb-2">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between font-montserrat font-bold text-xl mb-0 pl-4 border-l-4 border-primary-orange bg-primary-orange/10 hover:bg-primary-orange/50 p-2 rounded-t-lg transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-left">
                      <span>{category}</span>
                      <span className="text-sm text-text/60">
                        ({categoryProducts.length} items)
                      </span>
                      {categoryDiscountLabel(categoryProducts) && (
                        <span className="bg-primary-orange text-white px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
                          {categoryDiscountLabel(categoryProducts)}
                        </span>
                      )}
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
                      className="space-y-1 bg-primary border border-gray"
                    >
                      {categoryProducts.map((product, index) => (
                        <motion.div
                          key={product.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`${
                            index % 2 === 0 ? "bg-card" : "bg-card/10"
                          } rounded-lg p-3 shadow-sm hover:bg-card transition-colors relative`}
                          whileHover={{ scale: 1.02 }}
                        >
                          <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex items-center gap-3 flex-1">
                              {/* <Link to={`/product/${product.id}`}> */}
                              <button
                                type="button"
                                onClick={() =>
                                  setModalImage({
                                    src: product.image,
                                    alt: product.name,
                                  })
                                }
                                className="focus:outline-none"
                              >
                                <div className="w-14 h-14 flex items-center justify-center overflow-hidden rounded-lg shadow-md bg-white">
                                  {product.image && product.image.length > 1 ? (
                                    <ProductImageSlider
                                      images={product.image}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <img
                                      src={
                                        product.image &&
                                        product.image.length === 1
                                          ? product.image[0]
                                          : `/assets/img/logo/logo-product.png`
                                      }
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                              </button>
                              {/* </Link> */}
                              <div className="flex-1 min-w-0">
                                {/* <Link to={`/product/${product.id}`}> */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <h3 className="font-montserrat font-bold text-sm truncate">
                                    {product.name}
                                  </h3>
                                  <WishlistButton
                                    product={product}
                                    variant="inline"
                                    className="!p-1 !bg-transparent shrink-0"
                                  />
                                </div>
                                {/* </Link> */}
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-xs text-text/60">
                                    {product.content}
                                  </span>
                                  {/* Show stock only for admin/superadmin */}
                                  {(userRole?.name === "admin" ||
                                    userRole?.name === "superadmin") && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-text/60">
                                        Stock :
                                      </span>
                                      <span
                                        className={`font-bold text-sm ${
                                          product.stock !== undefined &&
                                          product.stock <= 0
                                            ? "text-red-500"
                                            : "text-text"
                                        }`}
                                      >
                                        {product.stock !== undefined
                                          ? product.stock > 0
                                            ? `${product.stock}`
                                            : "0"
                                          : "Unlimited"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 md:gap-6">
                              <div className="flex space-x-4 items-center gap-3 justify-between w-full md:w-auto">
                                <div className="flex flex-col gap-1 items-center">
                                  <span className="text-sm text-text/60 line-through">
                                    ₹{product.actual_price}
                                  </span>
                                  <span className="font-bold text-primary-orange">
                                    ₹{product.offer_price}
                                  </span>
                                </div>

                                {/* Add first, then the stepper. The box is
                                    the same width either way so the row does
                                    not jump when it switches. Both go through
                                    the same cart calls as before: Add is one
                                    increment, and typing 0 or pressing minus
                                    at 1 takes the item out and brings Add
                                    back. */}
                                <div className="w-[9.5rem] shrink-0">
                                  {(quantities[product.id] || 0) > 0 ? (
                                    <div className="flex w-full">
                                      <button
                                        type="button"
                                        onClick={() => handleDecrement(product.id)}
                                        className="p-2 rounded-l-lg bg-red-500/80 text-white hover:bg-red-500/60 transition-colors"
                                        aria-label={`Remove one ${product.name}`}
                                        id={`decrement-${product.id}`}
                                      >
                                        <Minus className="w-4 h-4" />
                                      </button>
                                      <NumberInput
                                        min="0"
                                        step="1"
                                        inputMode="numeric"
                                        max={product.stock}
                                        value={quantities[product.id] || 0}
                                        onValueChange={(n) =>
                                          handleQuantityChange(
                                            product.id,
                                            String(n)
                                          )
                                        }
                                        aria-label={`Quantity of ${product.name}`}
                                        className="flex-1 min-w-0 px-1 py-1 text-center border-x border-card-border/10 bg-card no-spinner"
                                        id={`input-quantity-${product.id}`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleIncrement(product.id)}
                                        className="p-2 rounded-r-lg bg-green-500/80 text-white hover:bg-green-500/60 transition-colors disabled:opacity-50"
                                        disabled={
                                          product.stock !== undefined &&
                                          product.stock <= 0
                                        }
                                        aria-label={`Add one more ${product.name}`}
                                        id={`increment-${product.id}`}
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleIncrement(product.id)}
                                      disabled={
                                        product.stock !== undefined &&
                                        product.stock <= 0
                                      }
                                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-primary-orange text-primary-orange font-montserrat font-bold text-sm hover:bg-primary-orange hover:text-white transition-colors disabled:opacity-50"
                                      aria-label={`Add ${product.name} to cart`}
                                      id={`add-${product.id}`}
                                    >
                                      <Plus className="w-4 h-4" />
                                      Add
                                    </button>
                                  )}
                                </div>
                                <div className="text-right min-w-[90px]">
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
                          {product.stock !== undefined &&
                                  product.stock <= 0 && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                      <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                                        OUT OF STOCK
                                      </div>
                                    </div>
                                  )}
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
      {modalImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-block-100 bg-opacity-5">
          <div className="relative bg-white p-4 rounded-lg shadow-sm shadow-gray/90 max-w-3xl w-full flex flex-col items-center border border-[#cac6c6]">
            <button
              onClick={() => setModalImage(null)}
              className="absolute top-2 right-2 text-gray-700 hover:text-red-500 text-2xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="mb-4 text-lg font-bold text-text text-center">
              {modalImage.alt}
            </h2>
            {modalImage.src.length === 1 ? (
              <img
                src={modalImage.src[0]}
                alt={modalImage.alt}
                className="max-w-[80vw] max-h-[80vh] rounded"
              />
            ) : (
              /* Use ProductImageSlider for multiple images */
              <ProductImageSlider
                images={modalImage.src}
                alt={modalImage.alt}
                className="max-w-[80vw] max-h-[80vh] rounded"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
