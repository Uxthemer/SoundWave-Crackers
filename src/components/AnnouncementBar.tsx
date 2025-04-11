import { Facebook, Twitter, Instagram, Phone, Mail } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="bg-primary-orange text-white py-2">
      <div className="container mx-auto px-4">
        {/* Mobile View - Only phone numbers */}
        <div className="md:hidden flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Phone className="w-4 h-4" />
            <a href="tel:+919994827099" className="text-sm">9994827099</a>
          </div>
          <div className="flex items-center space-x-2">
            <Phone className="w-4 h-4" />
            <a href="tel:+918668029052" className="text-sm">8668029052</a>
          </div>
        </div>

        {/* Desktop View - Full contact info */}
        <div className="hidden md:flex justify-between items-center">
          {/* Contact Info */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4" />
              <a href="tel:+919994827099" className="text-sm">9994827099</a>
            </div>
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4" />
              <a href="tel:+918668029052" className="text-sm">8668029052</a>
            </div>
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <a href="mailto:soundwavecracker@gmail.com" className="text-sm">
                soundwavecracker@gmail.com
              </a>
            </div>
          </div>

          {/* Social Icons */}
          <div className="flex items-center space-x-4">
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
              aria-label="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}