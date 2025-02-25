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
                  Sattur to Sivakasi Main Road
                  <br />
                  Sivakasi, Tamilnadu
                  <br />
                  India - 626201
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
                  +91 8668029052
                  <br />
                  +91 9789785488
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
                  <br />
                  support@soundwavecrackers.com
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

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-card rounded-lg p-6"
          >
            <form className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  placeholder="Your Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange h-32"
                  placeholder="Your Message"
                ></textarea>
              </div>
              <button type="submit" className="btn-primary w-full">
                Send Message
              </button>
            </form>
          </motion.div>
        </div>

        <div className="mt-12 rounded-lg overflow-hidden h-80">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15743.670428424452!2d77.79702274438844!3d9.442045050185751!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3b06cec03941565f%3A0x47c5b5f672dd0165!2sParapatti%2C%20Sivakasi%2C%20Tamil%20Nadu!5e0!3m2!1sen!2sin!4v1740511838623!5m2!1sen!2sin"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
          ></iframe>
        </div>
      </div>
    </section>
  );
}
