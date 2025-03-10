import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Star, Plus, Minus, ShoppingCart } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Thumbs } from 'swiper/modules';
import { Swiper as SwiperType } from 'swiper';
import { useProducts } from "../hooks/useProducts";
import { Product } from '../types';
import { useCartStore } from '../store/cartStore';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';

export function ProductDetails() {
  const { productId } = useParams();
  const { products } = useProducts();
  const navigate = useNavigate();
  const product = products.find(p => p.id === productId) as Product | undefined;
  const { addToCart } = useCartStore();
  const [quantity, setQuantity] = useState(1);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

  if (!product) {
    navigate('/explore');
    return null;
  }

  const relatedProducts = products
    .filter(p => p.categories.id === product.category.id && p.id !== product.id)
    .slice(0, 4);

  const handleQuantityChange = (value: string) => {
    const newQuantity = Math.max(1, parseInt(value) || 1);
    setQuantity(newQuantity);
  };

  const handleIncrement = () => setQuantity(prev => prev + 1);
  const handleDecrement = () => setQuantity(prev => Math.max(1, prev - 1));

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setQuantity(1);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="container mx-auto px-4">
        {/* Breadcrumb */}
        <nav className="flex items-center space-x-2 text-sm mb-8">
          <Link to="/" className="text-text/60 hover:text-primary-orange">Home</Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <Link to="/explore" className="text-text/60 hover:text-primary-orange">Explore</Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <Link 
            to={`/explore?category=${product.category.name.toLowerCase()}`}
            className="text-text/60 hover:text-primary-orange"
          >
            {product.category.name}
          </Link>
          <ChevronRight className="w-4 h-4 text-text/40" />
          <span className="text-text/80">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="relative bg-card rounded-xl overflow-hidden">
              <Swiper
                modules={[Navigation, Thumbs]}
                navigation
                thumbs={thumbsSwiper ? { swiper: thumbsSwiper } : {}}
                className="aspect-square"
              >
                {product.images?.map((image, index) => (
                  <SwiperSlide key={index}>
                    <div className="group relative">
                      <img
                        src={image}
                        alt={`${product.name} - View ${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
            
            <Swiper
              onSwiper={setThumbsSwiper}
              modules={[Navigation, Thumbs]}
              slidesPerView={4}
              spaceBetween={8}
              className="thumbs-swiper"
            >
              {product.images?.map((image, index) => (
                <SwiperSlide key={index}>
                  <button className="w-full aspect-square rounded-lg overflow-hidden">
                    <img
                      src={image}
                      alt={`${product.name} - Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Product Details */}
          <div>
            <h1 className="font-heading text-4xl mb-4">{product.name}</h1>
            
            <div className="flex items-center space-x-4 mb-6">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${
                      i < Math.floor(product.rating || 0)
                        ? 'fill-primary-yellow text-primary-yellow'
                        : 'text-text/20'
                    }`}
                  />
                ))}
              </div>
              <span className="text-text/60">
                {product.rating} ({product.reviews} reviews)
              </span>
            </div>

            <div className="bg-card/30 rounded-xl p-6 mb-8">
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-sm text-text/60 line-through">₹{product.actual_price}</p>
                  <p className="text-3xl font-bold text-primary-orange">₹{product.offer_price}</p>
                </div>
                <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
                  {product.discount_percentage}% OFF
                </span>
              </div>

              <p className="text-text/60 mb-6">{product.content}</p>

              <div className="flex items-center space-x-4 mb-6">
                <div className="flex items-center space-x-2">
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
                    className="w-20 px-3 py-2 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  />
                  <button
                    onClick={handleIncrement}
                    className="p-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleAddToCart}
                  className="btn-primary flex-1 flex items-center justify-center space-x-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span>Add to Cart</span>
                </button>
              </div>

              <p className="text-sm text-text/60">
                Total: <span className="font-bold text-text">₹{(quantity * product.offer_price).toFixed(2)}</span>
              </p>
            </div>

            <div className="prose prose-invert">
              <h2 className="font-montserrat font-bold text-xl mb-4">Description</h2>
              <p className="text-text/80">{product.description}</p>
            </div>
          </div>
        </div>

        {/* Related Products */}
        <div>
          <h2 className="font-heading text-3xl mb-8">Related Products</h2>
          <Swiper
            modules={[Navigation]}
            navigation
            slidesPerView={1}
            spaceBetween={24}
            breakpoints={{
              640: { slidesPerView: 2 },
              1024: { slidesPerView: 3 },
              1280: { slidesPerView: 4 }
            }}
          >
            {relatedProducts.map((relatedProduct) => (
              <SwiperSlide key={relatedProduct.id}>
                <Link
                  to={`/product/${relatedProduct.id}`}
                  className="block card group"
                >
                  <div className="relative mb-4 overflow-hidden rounded-lg">
                    <img
                      src={relatedProduct.image_url as string | undefined}
                      alt={relatedProduct.name}
                      className="w-full h-48 object-cover transform group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute top-2 right-2 bg-primary-orange text-white px-2 py-1 rounded-full text-sm">
                      {relatedProduct.discount_percentage}% OFF
                    </div>
                  </div>
                  <h3 className="font-montserrat font-bold text-lg mb-2">{relatedProduct.name}</h3>
                  <p className="text-sm text-text/60 mb-4">{relatedProduct.content}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-text/60 line-through">₹{relatedProduct.actual_price}</p>
                      <p className="font-bold text-primary-orange">₹{relatedProduct.offer_price}</p>
                    </div>
                    {/* <div className="flex items-center text-primary-yellow">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="ml-1">{relatedProduct.rating}</span>
                    </div> */}
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>
    </div>
  );
}