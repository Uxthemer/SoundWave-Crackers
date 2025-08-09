import { useEffect, useRef } from "react";
import Typed from "typed.js";
import { motion } from "framer-motion";
import { Award, Shield, Truck, Clock } from "lucide-react";

export function AboutSection() {
  const typedRef = useRef(null);

  useEffect(() => {
    const typed = new Typed(typedRef.current, {
      strings: ["The Rhythm of Celebrations"],
      typeSpeed: 50,
      backSpeed: 30,
      loop: true,
    });

    return () => typed.destroy();
  }, []);

  return (
    <section className="py-5 bg-card/30">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold italic bg-gradient-to-r from-red-500 to-yellow-400 text-transparent bg-clip-text mb-6">
              SoundWave Crackers
            </h1>
            <p className="font-dancing text-1xl md:text-2xl font-bold mb-3">
              <span ref={typedRef}></span>
            </p>
            <p className="text-text/80 mb-4 leading-relaxed ">
              <b>SoundWave Crackers</b> brings you top-quality fireworks to make every celebration pop! From festivals to weddings, we’ve got a vibrant range of safe and exciting crackers for all occasions.
            </p>
            <p className="text-text/80 mb-4 leading-relaxed">
             We only stock trusted brands, so you get bright, reliable fireworks without the worry. Great deals, easy shopping, and a huge selection — that’s what we’re all about.
            </p>
            <p className="text-text/80 mb-8 leading-relaxed">
              <i>
                Light up the moment with <b>SoundWave Crackers</b> — where every celebration shines brighter!
              </i>
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start space-x-3">
                <div className="bg-primary-orange/10 p-2 rounded-lg">
                  <Award className="w-5 h-5 text-primary-orange" />
                </div>
                <div>
                  <h3 className="font-montserrat font-bold mb-1">
                    Premium Quality
                  </h3>
                  <p className="text-sm text-text/60">
                    Highest grade materials
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-primary-orange/10 p-2 rounded-lg">
                  <Shield className="w-5 h-5 text-primary-orange" />
                </div>
                <div>
                  <h3 className="font-montserrat font-bold mb-1">
                    Safety First
                  </h3>
                  <p className="text-sm text-text/60">Rigorous testing</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-primary-orange/10 p-2 rounded-lg">
                  <Truck className="w-5 h-5 text-primary-orange" />
                </div>
                <div>
                  <h3 className="font-montserrat font-bold mb-1">
                    Fast Delivery
                  </h3>
                  <p className="text-sm text-text/60">Nationwide shipping</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="bg-primary-orange/10 p-2 rounded-lg">
                  <Clock className="w-5 h-5 text-primary-orange" />
                </div>
                <div>
                  <h3 className="font-montserrat font-bold mb-1">
                    24/7 Support
                  </h3>
                  <p className="text-sm text-text/60">Always here to help</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1"
          >
            <div className="aspect-square rounded-2xl overflow-hidden mb-6">
              <img
                src="/assets/img/cards/aboutus.jpg"
                alt="Fireworks display"
                className="w-full h-full object-cover"
              />
            </div>
            {/* <div className="aspect-square rounded-2xl overflow-hidden translate-y-12 mb-6">
              <img
                src="https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800&auto=format&fit=crop"
                alt="Sparklers"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="aspect-square rounded-2xl overflow-hidden -translate-y-12 mb-6">
              <img
                src="https://images.unsplash.com/photo-1533230408708-8f9f91d1235a?w=800&auto=format&fit=crop"
                alt="Festival celebration"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="aspect-square rounded-2xl overflow-hidden mb-6">
              <img
                src="https://images.unsplash.com/photo-1514912885225-5c9ec8507d68?w=800&auto=format&fit=crop"
                alt="Diwali celebration"
                className="w-full h-full object-cover"
              />
            </div> */}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
