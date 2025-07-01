import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="py-16 relative overflow-hidden">
      {/* Decorative gift box images for large screens */}
      <img
        src="/assets/img/cards/gift-box-new.png"
        alt="Gift Box Left"
        className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-96 xl:w-[28rem] z-10 ml-8"
        style={{ pointerEvents: "none" }}
      />
      <img
        src="/assets/img/cards/gift-box-new-2.png"
        alt="Gift Box Right"
        className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-96 xl:w-[28rem] z-10 mr-8"
        style={{ pointerEvents: "none" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow opacity-10" />
      <div className="absolute inset-0 bg-[url('/assets/img/banners/CTA-banner.png')] bg-center bg-cover" />
      <div className="container mx-auto px-4 md:px-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card rounded-2xl px-4 py-10 md:px-16 md:py-16 text-center relative overflow-hidden flex flex-col items-center"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-primary-red/5 via-primary-orange/5 to-primary-yellow/5 pointer-events-none" />
          <Sparkles className="w-12 h-12 text-primary-orange mx-auto mb-6" />
          <h2 className="font-heading text-4xl md:text-5xl mb-4 md:mb-6">
            Light Up Your Celebrations!
          </h2>
          <p className="text-lg md:text-xl text-text/80 mb-6 md:mb-8 max-w-2xl mx-auto">
            Get ready for Diwali with our premium collection of crackers. Enjoy
            exclusive discounts and special festival offers.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-8 mt-2">
            <Link to="/explore">
              <button className="btn-primary px-8 py-4 text-lg w-full sm:w-auto">
                Explore More Crackers
              </button>
            </Link>
            <Link to="/quick-purchase">
              <button className="px-8 py-4 text-lg border-2 border-primary-orange text-primary-orange rounded-lg hover:bg-primary-orange hover:text-white transition-colors w-full sm:w-auto">
                Quick Purchase
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
