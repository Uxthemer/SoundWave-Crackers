import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Both buttons share one size, weight and border width so they sit level.
 * The outline one used a 2px border against the gradient one's 1px and a
 * different font, so the pair never lined up.
 */
const CTA_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto min-w-[14rem] px-8 py-4 text-lg font-montserrat font-bold rounded-lg border-2 transition-all duration-300";

export function CTASection() {
  return (
    <section className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow opacity-10" />
      <div className="absolute inset-0 bg-[url('/assets/img/banners/CTA-banner.png')] bg-center bg-cover" />
      <div className="container mx-auto px-4 md:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          // The artwork lives inside the card as the outer columns of a grid.
          // Positioned against the section, it hung off the card's edges and
          // ran into the text at in-between widths.
          className="bg-card rounded-2xl px-4 py-10 md:px-12 md:py-14 lg:px-8 xl:px-12 relative overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,42rem)_1fr] items-center gap-8"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary-red/5 via-primary-orange/5 to-primary-yellow/5 pointer-events-none" />

          <img
            src="/assets/img/cards/gift-box-new.png"
            alt=""
            aria-hidden="true"
            className="hidden lg:block relative w-full max-w-[18rem] xl:max-w-[20rem] mx-auto object-contain pointer-events-none"
          />

          <div className="relative flex flex-col items-center text-center">
            <Sparkles className="w-12 h-12 text-primary-orange mb-6" />
            <h2 className="font-heading text-4xl md:text-5xl mb-4 md:mb-6">
              Light Up Your Celebrations!
            </h2>
            <p className="text-lg md:text-xl text-text/80 mb-8 max-w-2xl">
              Get ready for Diwali with our premium collection of crackers. Enjoy
              exclusive discounts and special festival offers.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 md:gap-6 w-full sm:w-auto">
              <Link
                to="/buy-cracker-online"
                className={`${CTA_BUTTON} border-transparent text-white bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow hover:scale-95 hover:shadow-lg hover:shadow-primary-red/20`}
              >
                Explore More Crackers
              </Link>
              <Link
                to="/quick-online-cracker"
                className={`${CTA_BUTTON} border-primary-orange text-primary-orange hover:bg-primary-orange hover:text-white`}
              >
                Quick Purchase
              </Link>
            </div>
          </div>

          <img
            src="/assets/img/cards/gift-box-new-2.png"
            alt=""
            aria-hidden="true"
            className="hidden lg:block relative w-full max-w-[18rem] xl:max-w-[20rem] mx-auto object-contain pointer-events-none"
          />
        </motion.div>
      </div>
    </section>
  );
}
