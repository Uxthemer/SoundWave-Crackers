import { useState, useEffect } from "react";

export function MarqueeText() {
  const messages = [
    "🎆 Special Diwali Offer - Up to 80% OFF!",
    "🚚 Minimum Orders Above ₹3000 for Tamilnadu and ₹5000 for other states",
    "🎉 Most Trustable and Best Customer Service",
    "⭐ New Festival Collection Available",
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size on mount & resize
  useEffect(() => {
    const checkScreenSize = () => setIsMobile(window.innerWidth < 768);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Cycle messages every 3 seconds in mobile view
  useEffect(() => {
    if (isMobile) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isMobile]);

  return (
    <div className="bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow text-white py-1 overflow-hidden">
      {isMobile ? (
        // Mobile View: Sliding fade-in-out text
        <div className="text-center font-semibold animate-fadeInOut text-xs sm:text-sm md:text-base lg:text-lg">
          {messages[currentMessageIndex]}
        </div>
      ) : (
        // Desktop View: Continuous marquee effect
        <div className="whitespace-nowrap flex space-x-4 animate-marquee text-xs sm:text-sm md:text-base lg:text-lg">
          {messages.map((message, index) => (
            <span key={index} className="mx-4">{message}</span>
          ))}
        </div>
      )}
    </div>
  );
}
