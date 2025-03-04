import { Facebook, Twitter, Instagram, Phone, Mail } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="bg-primary-orange text-white py-2">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-center">
          {/* Left-aligned first phone number */}
          <div className="flex items-center space-x-2">
            <Phone className="w-4 h-4" />
            <a href="tel:+918668029052" className="text-xs sm:text-sm md:text-base lg:text-lg">8668029052</a>
          </div>
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4" />
            <a href="mailto:soundwavecracker@gmail.com" className="text-xs sm:text-sm md:text-base lg:text-lg">
              soundwavecracker@gmail.com
            </a>
          </div>

          {/* Right-aligned second phone number */}
          {/* <div className="flex items-center space-x-2">
            <Phone className="w-4 h-4" />
            <a href="tel:+919789785488">9789785488</a>
          </div> */}

          {/* Social Icons (hidden on mobile) */}
          <div className="hidden md:flex items-center space-x-4">
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
            >
              <Instagram className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
