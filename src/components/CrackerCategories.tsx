import { motion } from "framer-motion";
import { ArrowRight,Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useCategories } from '../hooks/useCategories';

export function CrackerCategories() {
  const { categories, loading: categoriesLoading } = useCategories();

  if (categoriesLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  return (
    <section className="py-2 bg-card/30">
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
        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 md:gap-6">
          {categories.map((category) => (
            <Link key={category.id} to={`/explore?category=${category.name.toLowerCase()}`} className="transform hover:scale-110 transition-transform duration-500">
              <div
                className="card group relative overflow-hidden rounded-xl shadow-lg p-2 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center">
                  <img
                    src={category.image_url ? `/assets/img/categories/${category.image_url}` : `/assets/img/logo/logo_2.png`}
                    alt={category.name}
                    className="w-full h-full object-contain transition-transform duration-500"
                  />
                </div>
                <h3 className="text-black/90 font-semibold text-sm md:text-base mt-2">
                  {category.name}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-black/60 text-xs md:text-sm">
                    {category.description}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
