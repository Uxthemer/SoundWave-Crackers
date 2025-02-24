import { motion } from 'framer-motion';
import { brandLogos } from '../data/products';

export function BrandLogos() {
  return (
    <div className="py-12 bg-card/30">
      <div className="container mx-auto px-6">
        <h2 className="font-heading text-3xl mb-8 text-center text-glow">
          How It Works
        </h2>
        <div className="grid grid-cols-4 md:grid-cols-4 lg:grid-cols-4 gap-8 place-items-center">
          {brandLogos.map((brand) => (
            <motion.div
              key={brand.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="aspect-square relative group"
            >
              <img
                src={brand.logo}
                alt={brand.name}
                className="w-full h-full object-contain filter grayscale group-hover:grayscale-0 transition-all duration-300"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}