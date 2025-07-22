// components/QuickPurchaseButton.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const QuickPurchaseButton: React.FC = () => {
  const [animate, setAnimate] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  // Check if the current path is not "/quick-online-cracker" to avoid animation on that page
  const isQuickPurchasePage = location.pathname === "/quick-online-cracker";

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimate(false);
    }, 60000); // Start animation after 1 second

    return () => clearTimeout(timer); // Cleanup on unmount
  }, []);

  const handleClick = () => {
    navigate("/quick-online-cracker");
  };

  return (
    !isQuickPurchasePage && <button
      onClick={handleClick}
      className={`hidden md:block fixed bottom-2 right-4 z-50 ${
        animate ? "animate-bounce" : ""
      }`}
      aria-label="Quick Purchase"
    >
      <img
        src="/assets/img/icons/quick-purchase-1.png"
        alt="Quick Purchase"
        className="w-auto h-14 transition-transform duration-300 ease-in-out hover:scale-105"
        loading="lazy"
      />
    </button>
  );
};

export default QuickPurchaseButton;
