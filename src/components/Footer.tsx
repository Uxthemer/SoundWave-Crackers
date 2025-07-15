import { Link } from "react-router-dom";
import { Sparkles, Facebook, Twitter, Instagram, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card pt-16 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div>
            <Link to="/" className="flex items-center mb-6">
              <img
                src="/assets/img/logo/logo_2.png"
                alt="SoundWave Crackers"
                className="hidden dark:block h-20 w-auto dark:invert"
              />
              <img
                src="/assets/img/logo/logo_2.png"
                alt="SoundWave Crackers"
                className="block dark:hidden h-20 w-auto light:invert"
              />
            </Link>
            <p className="text-text/60 mb-6">
              Your premier destination for premium-quality crackers and
              fireworks, making your celebrations brighter and more memorable.
            </p>
            <div className="flex space-x-4">
              <a
                href="https://www.facebook.com/share/1EdxBeuFzS/"
                className="text-text/60 hover:text-primary-orange transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook-Footer"
              >
                <Facebook className="w-5 h-5" />
              </a>
              {/* <a
                href="#"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a> */}
              <a
                href="https://www.instagram.com/soundwavecrackers/?igsh=MjE0OGJsZXkwcjhk#"
                className="text-text/60 hover:text-primary-orange transition-colors"
                aria-label="Instagram-Footer"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://www.youtube.com/@SoundWaveCrackers"
                className="text-text/60 hover:text-primary-orange transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Youtube-Footer"
              >
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-montserrat font-bold text-lg mb-6">
              Quick Links
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href="/#cracker-categories"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Crackers Categories
                </a>
              </li>
              <li>
                <a
                  href="/#trending-crackers"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Trending Products
                </a>
              </li>
              <li>
                <a
                  href="/#about-us"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="/#contact-us"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-montserrat font-bold text-lg mb-6">
              Useful Links
            </h3>
            <ul className="space-y-4">
              <li>
                <Link
                  to="/payment"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Payment Options
                </Link>
              </li>
              <li>
                <Link
                  to="/track-order"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Track Your Order
                </Link>
              </li>
              <li>
                <a
                  href="/#blog"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="/#faqs"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* <div>
            <h3 className="font-montserrat font-bold text-lg mb-6">
              Exclusive Offers
            </h3>
            <p className="text-text/60 mb-4">
              Subscribe for updates and exclusive offers!
            </p>
            <form className="space-y-4">
              <input
                type="email"
                placeholder="Your email address"
                className="w-full px-4 py-2 rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <button type="submit" className="btn-primary w-full">
                Subscribe
              </button>
            </form>
          </div> */}
          {/* Right Section - Important Notice */}
          <div className="">
            <h3 className="text-lg font-semibold text-primary-orange">
              Important Notice
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              We value our customers and respect the law, so we cannot sell
              firecrackers online as per the 2018 Supreme Court order. Please
              add your desired products to the cart and use the enquiry button
              to submit your request. We will contact you within 24 hours to
              confirm your order through WhatsApp or a phone call.
            </p>
          </div>
        </div>

        <div className="border-t border-card-border/10 pt-8 pb-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-text/60">
              © 2025 SoundWave Crackers. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <Link
                to="/shipping-policy"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                Shipping Policy
              </Link>
              <Link
                to="/cancellation-policy"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                Cancellation & Return Policy
              </Link>
              <Link
                to="/privacy"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
