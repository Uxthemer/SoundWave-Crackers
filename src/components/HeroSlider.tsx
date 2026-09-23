import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import { motion } from 'framer-motion';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { heroSlides } from '../data/products';

/**
 * The banners are wide — between 16:9 and almost 3:1 — and they are not going
 * to agree with the shape of a phone screen.
 *
 * On a phone the slide is a 2:1 band and the banner fills it, cropping
 * whatever hangs over. 2:1 is the shape of the standard banner, so that one
 * lands with nothing lost; the wider ones give up their left and right edges.
 * Letterboxing them instead left grey bars inside the slider, which read as a
 * broken image rather than a deliberate margin.
 *
 * From `sm` up the box is close enough to the artwork's own shape that the
 * same fill crops only the edges.
 */
export function HeroSlider() {
  return (
    <div className="relative">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 7000 }}
        className="hero-slider w-full aspect-[2/1] sm:aspect-auto sm:h-[400px] md:h-[500px] lg:h-[600px]"
      >
        {heroSlides.map((slide, index) => (
          <SwiperSlide key={slide.id}>
            <div className="relative w-full h-full">
              <img
                src={slide.image}
                alt={slide.title}
                // Only the banner on screen at load blocks anything; the rest
                // are megabytes a phone should not be spending up front.
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 flex items-center">
                <div className="container mx-auto px-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-2xl text-center md:text-left"
                  >
                    {/* Content if needed */}
                  </motion.div>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/*
        Swiper's arrows are drawn at a fixed 44px and sit over the artwork on a
        narrow screen. Swiping is the obvious gesture there, so the dots are
        enough.
      */}
      <style>{`
        @media (max-width: 639px) {
          .hero-slider .swiper-button-next,
          .hero-slider .swiper-button-prev {
            display: none;
          }
          .hero-slider .swiper-pagination-bullet {
            width: 6px;
            height: 6px;
          }
        }
      `}</style>
    </div>
  );
}
