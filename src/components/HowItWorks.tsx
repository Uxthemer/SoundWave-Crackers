
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ShoppingBag, Truck, CreditCard, Clock } from "lucide-react";

export const HowItWorks = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [100, 0, -100]);

  const steps = [
    {
      icon: ShoppingBag,
      title: "Browse & Select",
      description: "Choose from our wide range of crackers",
    },
    {
      icon: CreditCard,
      title: "Easy Payment",
      description: "Secure payment options including EMI",
    },
    {
      icon: Truck,
      title: "Fast Delivery",
      description: "Quick delivery to your doorstep",
    },
    {
      icon: Clock,
      title: "24/7 Support",
      description: "Round the clock customer support",
    },
  ];

  return (
    <section ref={ref} className="py-16 bg-gradient-to-b from-festive-dark/50 to-festive-blue/20">
      <motion.div 
        style={{ opacity, y }}
        className="container mx-auto px-4"
      >
        <h2 className="font-heading text-4xl text-center mb-12">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
                className="card rounded-lg p-6 text-center hover:scale-105 transition-transform duration-300"
              >
                <div className="mb-4 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-festive-orange/10 flex items-center justify-center">
                    <Icon className="w-8 h-8 text-festive-orange" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
};