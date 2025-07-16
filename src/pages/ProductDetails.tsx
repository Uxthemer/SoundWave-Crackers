import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Star,
  Plus,
  Minus,
  ShoppingCart,
  Loader2,
  Youtube,
} from "lucide-react";
import { useProducts } from "../hooks/useProducts";
import { useCartStore } from "../store/cartStore";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import { ProductImageSlider } from "../components/ProductImageSlider";

export function ProductDetails() {
  const { productId } = useParams();
  const { products, loading } = useProducts();
  const navigate = useNavigate();
  const { items, addToCart, updateQuantity } = useCartStore();
  const [showQuantity, setShowQuantity] = useState(false);

  const product = products.find((p) => p.id === productId);
  const cartItem = items.find((item) => item.id === productId);
  const [quantity, setQuantity] = useState(cartItem?.quantity || 1);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    // Update local quantity when cart changes
    const item = items.find((item) => item.id === productId);
    if (item) {
      setQuantity(item.quantity);
      setShowQuantity(true);
    } else {
      // If not in cart, reset to default
      setQuantity(1);
      setShowQuantity(false);
    }
  }, [productId, product?.id, items]);

  const openVideoModal = (videoUrl: string) => {
    setVideoUrl(videoUrl);
    setIsVideoModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!product) {
    navigate("/explore");
    return null;
  }

  const relatedProducts = products
    .filter(
      (p) => p.categories.id === product.category_id && p.id !== product.id // Exclude the current product
    )
    .slice(0, 4);

  const handleQuantityChange = (value: string) => {
    const newQuantity = Math.max(1, parseInt(value) || 1);
    setQuantity(newQuantity);
    if (cartItem) {
      updateQuantity(product.id, newQuantity);
    }
  };

  const handleIncrement = () => {
    const newQuantity = quantity + 1;
    setQuantity(newQuantity);
    if (cartItem) {
      updateQuantity(product.id, newQuantity);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      const newQuantity = quantity - 1;
      setQuantity(newQuantity);
      if (cartItem) {
        updateQuantity(product.id, newQuantity);
      }
    }
  };

  const handleAddToCart = () => {
    if (product) {
      addToCart(
        {
          id: product.id,
          name: product.name,
          description: product.description || "",
          image: product.image_url
            ? `/assets/img/crackers/${product.image_url.split(",")[0]}`
            : "/assets/img/logo/logo-product.png",
          offer_price: product.offer_price,
          actual_price: product.actual_price,
          content: product.content || "",
          discount_percentage: product.discount_percentage,
          cateDescription: product.categories.description,
          image_url: product.categories.image_url || "",
          created_at: product.categories.created_at,
          category: {
            id: product.categories.id,
            name: product.categories.name,
            cateDescription: product.categories.description,
            image_url: product.categories.image_url || "",
            created_at: product.categories.created_at,
          },
        },
        quantity
      );
      setShowQuantity(true);
    }
  };

  return (
    <div className="min-h-screen pt-12 pb-12">
      <div className="container mx-auto px-4">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm mb-8">
          <Link to="/" className="text-text/60 hover:text-primary-orange">
            Home
          </Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <Link
            to="/explore"
            className="text-text/60 hover:text-primary-orange"
          >
            Explore
          </Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <Link
            to={`/explore?category=${product.categories.name.toLowerCase()}`}
            className="text-text/60 hover:text-primary-orange"
          >
            {product.categories.name}
          </Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <span className="text-text/80">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="relative bg-card rounded-xl overflow-hidden">
              {product.image_url && product.image_url.split(",").length > 1 ? (
                <ProductImageSlider
                  images={product.image_url
                    .split(",")
                    .map((url) => `/assets/img/crackers/${url}`)}
                  alt={product.name}
                  className="aspect-square"
                />
              ) : (
                <img
                  src={
                    product.image_url
                      ? `/assets/img/crackers/${product.image_url}`
                      : "/assets/img/logo/logo-product.png"
                  }
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>

          {/* Product Details */}
          <div>
            <h1 className="font-heading text-4xl mb-4">{product.name}</h1>

            {/* <div className="flex items-center space-x-4 mb-6">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                
                      i < 4
                        ? 'fill-primary-yellow text-primary-yellow'
                        : 'text-text/20'
                    }`}
                  />
                ))}
              </div>
              <span className="text-text/60">
                4.0 (50 reviews)
              </span>
            </div> */}

            <div className="relative bg-card/50 rounded-xl p-6 mb-8">
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-sm text-text/60 line-through">
                    ₹{product.actual_price}
                  </p>
                  <p className="text-3xl font-bold text-primary-orange">
                    ₹{product.offer_price}
                  </p>
                </div>
                <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
                  {product.discount_percentage}% OFF
                </span>
              </div>

              {product.yt_link && <button
                onClick={() => openVideoModal(product.yt_link || "")}
                className="absolute top-4 right-4 text-left hover:text-red w-7 h-6 flex items-center justify-center bg-white/80 rounded-md transition-colors"
                aria-label="Youtube"
                title="Watch video in youtube"
              >
                <Youtube className="w-8 h-8 text-red-500 hover:fill-red-500 hover:text-black" />
              </button>}

              <p className="text-text/60 mb-6">{product.content}</p>

              <div className="flex items-center space-x-4 mb-6">
                {showQuantity ? (
                  <div className="flex items-center space-x-2 flex-1">
                    <button
                      onClick={handleDecrement}
                      className="p-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => handleQuantityChange(e.target.value)}
                      className="quantity-input"
                    />
                    <button
                      onClick={handleIncrement}
                      className="p-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleAddToCart}
                    className="btn-primary flex-1 flex items-center justify-center space-x-2"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    <span>Add to Cart</span>
                  </button>
                )}
              </div>

              <p className="text-sm text-text/60">
                Total:{" "}
                <span className="font-bold text-text">
                  ₹{(quantity * product.offer_price).toFixed(2)}
                </span>
              </p>
            </div>

            <div className="prose prose-invert">
              <h2 className="font-montserrat font-bold text-xl mb-4">
                Description
              </h2>
              <div
                className="text-text/80 space-y-4"
                dangerouslySetInnerHTML={{ __html: product.description ?? "" }}
              />
            </div>
            <p>
              <strong>Safety Tips:</strong>
              <ul className="ml-5">
                <li>Light one at a time.</li>
                <li>keep water nearby</li>
                <li>
                  keep away from flammable materials, Maintain a safe distance.
                </li>
                <li>Supervise children, wear ear protection.</li>
                <li>Do not hold in hand</li>
                <li>keep away from pets.</li>
              </ul>
            </p>
          </div>
        </div>

        {/* Related Products */}
        <div>
          <h2 className="font-heading text-3xl mb-8">Related Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((relatedProduct) => {
              const relatedCartItem = items.find(
                (item) => item.id === relatedProduct.id
              );

              return (
                <Link
                  key={relatedProduct.id}
                  to={`/product/${relatedProduct.id}`}
                  className="block card group"
                >
                  <div className="relative mb-4 overflow-hidden rounded-lg">
                    {relatedProduct.image_url &&
                    relatedProduct.image_url.split(",").length > 1 ? (
                      <ProductImageSlider
                        images={relatedProduct.image_url
                          .split(",")
                          .map((url) => `/assets/img/crackers/${url}`)}
                        alt={relatedProduct.name}
                        className="aspect-square transform group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <img
                        src={
                          relatedProduct.image_url
                            ? `/assets/img/crackers/${relatedProduct.image_url}`
                            : `/assets/img/logo/logo-product.png`
                        }
                        alt={relatedProduct.name}
                        className="aspect-square transform group-hover:scale-110 transition-transform duration-500"
                      />
                    )}

                    <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                      {relatedProduct.discount_percentage}% OFF
                    </div>
                    {relatedCartItem && (
                      <div className="absolute bottom-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                        {relatedCartItem.quantity} in cart
                      </div>
                    )}
                  </div>
                  <h3 className="font-montserrat font-bold text-lg mb-2">
                    {relatedProduct.name}
                  </h3>
                  <p className="text-sm text-text/60 mb-4">
                    {relatedProduct.content}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text/60 line-through">
                        ₹{relatedProduct.actual_price}
                      </p>
                      <p className="font-bold text-primary-orange">
                        ₹{relatedProduct.offer_price}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
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
    </div>
  );
}
