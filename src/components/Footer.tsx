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
                src="/assets/img/logo/logo_1.png"
                alt="SoundWave Crackers"
                className="hidden dark:block h-20 w-auto dark:invert"
              />
              <img
                src="/assets/img/logo/logo_1.png"
                alt="SoundWave Crackers"
                className="block dark:hidden h-20 w-auto light:invert"
              />
            </Link>
            <p className="text-text/60 mb-6">
              Your premier destination for premium quality crackers and
              fireworks. Making your celebrations brighter since 2020.
            </p>
            <div className="flex space-x-4">
              <a
                href="#"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-text/60 hover:text-primary-orange transition-colors"
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
                <Link
                  to="/about"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  to="/products"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Products
                </Link>
              </li>
              <li>
                <Link
                  to="/offers"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Special Offers
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-montserrat font-bold text-lg mb-6">
              Categories
            </h3>
            <ul className="space-y-4">
              <li>
                <Link
                  to="/category/aerial"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Aerial Fireworks
                </Link>
              </li>
              <li>
                <Link
                  to="/category/ground"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Ground Spinners
                </Link>
              </li>
              <li>
                <Link
                  to="/category/sparklers"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Sparklers
                </Link>
              </li>
              <li>
                <Link
                  to="/category/fountains"
                  className="text-text/60 hover:text-primary-orange transition-colors"
                >
                  Fountains
                </Link>
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
          <div>
          <h3 className="font-montserrat font-bold text-lg mb-6">
              Scan QR Code for Payment
            </h3>
            <img src="" alt="Scan QR Code for Payment">
            </img>
          </div>
        </div>

        <div className="border-t border-card-border/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-text/60">
              © 2025 SoundWave Crackers. All rights reserved.
            </p>
            <div className="flex space-x-6">
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
              <Link
                to="/shipping"
                className="text-text/60 hover:text-primary-orange transition-colors"
              >
                Shipping Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
