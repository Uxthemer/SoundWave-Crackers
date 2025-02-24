export function MarqueeText() {
  return (
    <div className="bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow text-white py-1 overflow-hidden">
      <div className="animate-marquee whitespace-nowrap">
        <span className="mx-4">🎆 Special Diwali Offer - Up to 80% OFF!</span>
        <span className="mx-4">|</span>
        <span className="mx-4">🚚 Minimum Orders Above ₹3000 for Tamilnadu and ₹5000 for other states</span>
        <span className="mx-4">|</span>
        <span className="mx-4">🎉 Most Trustable and Best Customer Service</span>
        <span className="mx-4">|</span>
        <span className="mx-4">⭐ New Festival Collection Available</span>
      </div>
    </div>
  );
}