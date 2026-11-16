import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";

/**
 * The chit scheme's printed banners, scrolling at the top of the chit page.
 * They stop while the pointer rests on them -- someone reading the table on a
 * banner should not have it slide away -- and while a finger holds one.
 *
 * Next season's banner is a new file in public/assets/img/banners/chit/ and a
 * line here. The alt text carries the banner's content for anyone who cannot
 * see the image, and for search engines.
 */
const SLIDES = [
  {
    src: "/assets/img/banners/chit/diwali-2027-chit-english.jpg",
    alt:
      "Diwali 2027 chit schemes: pay Rs. 500, 1,000, 2,000, 3,000, 4,000 or 5,000 a month for 9 months; " +
      "we pay the 10th month, so you get crackers worth Rs. 5,000 to 50,000. Starts 1 December 2026, " +
      "ends September 2027, crackers dispatched September 2027 to members who complete the scheme.",
  },
  {
    src: "/assets/img/banners/chit/diwali-2027-chit-tamil.jpg",
    alt: "தீபாவளி 2027 சிட்டு திட்டங்கள் — Diwali 2027 chit schemes, in Tamil",
  },
];

export function ChitBanner() {
  return (
    <div className="chit-banner w-full overflow-hidden">
      <Swiper
        modules={[Autoplay, Pagination]}
        slidesPerView={1}
        loop
        speed={700}
        autoplay={{ delay: 5000, disableOnInteraction: false, pauseOnMouseEnter: true }}
        pagination={{ clickable: true }}
      >
        {SLIDES.map((slide, i) => (
          <SwiperSlide key={slide.src}>
            {/* Edge to edge at the banner's own 2:1 shape, so it is never
                cropped -- it holds the plan table and dates people read.
                It is tall on a wide screen; that is the price of showing
                all of it at full width (a capped height cut the title and
                the dates row off). */}
            <img
              src={slide.src}
              alt={slide.alt}
              width={1600}
              height={800}
              loading={i === 0 ? "eager" : "lazy"}
              className="block w-full h-auto aspect-[2/1] object-cover"
            />
          </SwiperSlide>
        ))}
      </Swiper>
      <style>{`
        .chit-banner .swiper-pagination { bottom: 10px; }
        .chit-banner .swiper-pagination-bullet { background: #fff; opacity: .6; }
        .chit-banner .swiper-pagination-bullet-active { background: #ff5722; opacity: 1; }
      `}</style>
    </div>
  );
}
