import { motion } from 'framer-motion';

const baseCompanies = [
  {
    id: 1,
    name: "Standard Fireworks",
    logo: "https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop"
  },
  {
    id: 2,
    name: "Supreme Crackers",
    logo: "https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&auto=format&fit=crop"
  },
  {
    id: 3,
    name: "Galaxy Fireworks",
    logo: "https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=800&auto=format&fit=crop"
  }
];

// Create repeated array for continuous scroll
const companies = [...baseCompanies, ...baseCompanies, ...baseCompanies];

export function CompanyScroll() {
  return (
    <div className="py-12 bg-card/30 overflow-hidden">
      <div className="container mx-auto px-6 mb-8">
        <h2 className="font-heading text-3xl text-center">Trusted by Leading Brands</h2>
      </div>
      <div className="relative">
        <div className="flex space-x-8 animate-scroll">
          {companies.map((company, index) => (
            <motion.div
              key={`${company.id}-${index}`}
              className="flex-shrink-0 w-48 h-24 bg-card rounded-lg p-4 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <img
                src={company.logo}
                alt={company.name}
                className="max-w-full max-h-full object-contain filter grayscale hover:grayscale-0 transition-all duration-300"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}