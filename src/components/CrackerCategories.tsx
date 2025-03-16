import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
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
            <Link 
              key={category.id} 
              to={`/explore?category=${category.name.toLowerCase()}`} 
              className="transform hover:scale-110 transition-transform duration-500"
            >
              <div className="card group relative overflow-hidden aspect-square flex flex-col items-center justify-center text-center p-2">
                <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center mb-2">
                  <img
                    src={category.image_url ? `/assets/img/categories/${category.image_url}` : `/assets/img/logo/logo_2.png`}
                    alt={category.name}
                    className="w-full h-full object-contain transition-transform duration-500"
                  />
                </div>
                <h3 className="text-black/90 font-semibold text-xs md:text-sm truncate w-full">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-black/60 text-xs truncate w-full mt-1">
                    {category.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}