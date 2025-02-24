import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const categories = [
  {
    id: 1,
    name: 'Aerial Fireworks',
    description: 'Spectacular sky-high displays with colorful bursts and patterns',
    image: 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop',
    count: 25
  },
  {
    id: 2,
    name: 'Ground Spinners',
    description: 'Exciting ground-level effects with spinning lights and colors',
    image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&auto=format&fit=crop',
    count: 15
  },
  {
    id: 3,
    name: 'Sparklers',
    description: 'Classic handheld sparklers for all ages',
    image: 'https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=800&auto=format&fit=crop',
    count: 30
  }
];

export function CrackerCategories() {
  return (
    <section className="py-16 bg-card/30">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-center mb-12">
          <h2 className="font-heading text-4xl">Cracker Categories</h2>
          <Link 
            to="/explore" 
            className="flex items-center space-x-2 text-primary-orange hover:text-primary-red transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {categories.map((category) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="group relative overflow-hidden rounded-xl"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-6 flex flex-col justify-end">
                <h3 className="text-white font-montserrat font-bold text-2xl mb-2">
                  {category.name}
                </h3>
                <p className="text-white/80 mb-4 line-clamp-2">
                  {category.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{category.count} Products</span>
                  <Link
                    to={`/explore?category=${category.name.toLowerCase()}`}
                    className="bg-primary-orange text-white px-4 py-2 rounded-lg transform translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300"
                  >
                    Explore Now
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}