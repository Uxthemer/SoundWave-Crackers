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
            {/* A full-width band, at most 480px tall. The banner sits in it
                whole -- scaled to the band, never cropped (it holds the plan
                table and dates people read), never enlarged -- and the band
                either side of it is the same picture, blurred. Below 960px
                wide the banner fills the width exactly, as before.
                To change the height: the two 480px values here. */}
            <div className="relative w-full h-[50vw] max-h-[480px] overflow-hidden bg-[#1e2a4a]">
              <img
                src={slide.src}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-70"
              />
              <div className="absolute inset-0 bg-black/15" />
              <img
                src={slide.src}
                alt={slide.alt}
                width={1600}
                height={800}
                loading={i === 0 ? "eager" : "lazy"}
                className="relative mx-auto block h-full w-auto max-w-full object-contain shadow-2xl"
              />
            </div>
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
