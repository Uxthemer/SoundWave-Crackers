import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export function ContactSection() {
  return (
    <section id="contact" className="py-16 bg-card/30">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-heading text-4xl mb-4">Contact Us</h2>
          <p className="text-text/60 max-w-2xl mx-auto">
            Have questions about our products or need assistance? We're here to
            help you make your celebration spectacular!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            <div className="flex items-start space-x-4">
              <div className="bg-primary-orange/10 p-3 rounded-lg">
                <MapPin className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg mb-2">
                  Visit Us
                </h3>
                <p className="text-text/60">
                  SoundWave Crackers
                  <br />
                  Kananjampatti, Sattur-Sivakasi-kalugumalai Road,
                  <br />
                  Vembakottai, Sivakasi, Tamilnadu
                  <br />
                  India - 626131
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-primary-orange/10 p-3 rounded-lg">
                <Phone className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg mb-2">
                  Call Us
                </h3>
                <p className="text-text/60">
                  +91 9363515184
                  <br />
                  +91 9789794518
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-primary-orange/10 p-3 rounded-lg">
                <Mail className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg mb-2">
                  Email Us
                </h3>
                <p className="text-text/60">
                  soundwavecrackers@gmail.com
                  {/* <br />
                  support@soundwavecrackers.com */}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="bg-primary-orange/10 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-primary-orange" />
              </div>
              <div>
                <h3 className="font-montserrat font-bold text-lg mb-2">
                  Business Hours
                </h3>
                <p className="text-text/60">
                  Monday - Saturday: 9:00 AM - 8:00 PM
                  <br />
                  Sunday: 10:00 AM - 6:00 PM
                </p>
              </div>
            </div>
          </motion.div>

          {/* Replace the form with a map */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-card rounded-lg p-0 overflow-hidden flex items-center"
          >
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d445.3174111698699!2d77.78135421525435!3d9.356784794929018!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e1!3m2!1sen!2sin!4v1749632811746!5m2!1sen!2sin"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full"
              title="Google Map of Soundwave Crackers Location"
              aria-label="Google Map of Soundwave Crackers Location"
              aria-hidden="false"
            ></iframe>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
