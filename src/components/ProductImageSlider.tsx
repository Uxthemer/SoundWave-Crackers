import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";

interface ProductImageSliderProps {
  images: string[];
  alt: string;
  className?: string;
}

export function ProductImageSlider({ images, alt, className = "" }: ProductImageSliderProps) {
  if (!images || images.length === 0) return null;
  if (images.length === 1) {
    return (
      <img
        src={images[0]}
        alt={alt}
        className={className}
        style={{ objectFit: "cover", width: "100%", height: "100%" }}
      />
    );
  }
  return (
    <Swiper
      modules={[Pagination, Autoplay]}
      pagination={{ clickable: true, dynamicBullets: true }}
      loop
      autoplay={{ delay: 2500, disableOnInteraction: false }}
      className={className}
      style={{ width: "100%", height: "100%" }}
    >
      {images.map((src, idx) => (
        <SwiperSlide key={idx}>
          <img
            src={src}
            alt={alt}
            className={`${className} object-fit-cover`}
            style={{ width: "100%", height: "100%" }}
          />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}