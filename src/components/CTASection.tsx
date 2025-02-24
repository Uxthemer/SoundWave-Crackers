import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export function CTASection() {
  return (
    <section className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow opacity-10" />
      <div className="container mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card rounded-2xl p-12 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-primary-red/5 via-primary-orange/5 to-primary-yellow/5" />
          <Sparkles className="w-12 h-12 text-primary-orange mx-auto mb-6" />
          <h2 className="font-heading text-5xl mb-6">
            Light Up Your Celebrations!
          </h2>
          <p className="text-xl text-text/80 mb-8 max-w-2xl mx-auto">
            Get ready for Diwali with our premium collection of crackers. 
            Enjoy exclusive discounts and special festival offers.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <button className="btn-primary px-8 py-4 text-lg">
              Shop Festival Collection
            </button>
            <button className="px-8 py-4 text-lg border-2 border-primary-orange text-primary-orange rounded-lg hover:bg-primary-orange hover:text-white transition-colors">
              View Offers
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}