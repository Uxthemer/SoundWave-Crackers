import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Clock,
  Gift,
  CalendarCheck,
  Package,
  IndianRupee,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useScheme } from "../hooks/useScheme";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import { supabase } from "../lib/supabase";
import { Database } from "../types/supabase";
import { toast } from "react-hot-toast";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import { formatDistanceToNow } from "date-fns"; // For countdown

type Scheme = Database["public"]["Tables"]["schemes"]["Row"];
type SchemeSelection = Database["public"]["Tables"]["scheme_selections"]["Row"];

const schemeSlides = [
  {
    id: 1,
    image: "/assets/img/banners/CTA-banner.png",
    title: "Monthly Savings Scheme",
    description: "Save monthly and get extra crackers as bonus!",
  },
  {
    id: 2,
    image: "/assets/img/banners/footer-banner.png",
    title: "Flexible Payment Options",
    description: "Choose your monthly installment amount",
  },
  {
    id: 3,
    image: "/assets/img/banners/CTA-banner.png",
    title: "Free Delivery",
    description: "Get your crackers delivered free of cost",
  },
];

export function MonthlyInstallment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectScheme, getActiveScheme, isLoading, error } = useScheme();
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  const [activeScheme, setActiveScheme] = useState<{
    scheme: Scheme;
    activeScheme: SchemeSelection;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [schemeToConfirm, setSchemeToConfirm] = useState<Scheme | null>(null);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(true);

  useEffect(() => {
    const fetchSchemes = async () => {
      try {
        const { data, error } = await supabase
          .from("schemes")
          .select("*")
          .eq("is_active", true)
          .order("installment", { ascending: true });

        if (error) throw error;
        setSchemes(data || []);
      } catch (err) {
        console.error("Error fetching schemes:", err);
        toast.error("Failed to load schemes");
      } finally {
        setIsLoadingSchemes(false);
      }
    };

    fetchSchemes();
  }, []);

  useEffect(() => {
    const fetchActiveScheme = async () => {
      if (user) {
        const scheme = await getActiveScheme();
        if (scheme) {
          setActiveScheme({ activeScheme: scheme, scheme: scheme.schemes } as {
            scheme: Scheme;
            activeScheme: SchemeSelection;
          });
        }
      }
    };
    fetchActiveScheme();
  }, [user, getActiveScheme]);

  const handleSchemeSelect = (scheme: Scheme) => {
    if (!user) {
      toast.error("Please login to select a scheme");
      navigate("/login");
      return;
    }

    if (activeScheme) {
      toast.error("You already have an active scheme. Please contact support to change it.");
      return;
    }

    if (!scheme.is_active) {
      toast.error("This scheme is no longer available");
      return;
    }

    if (
      scheme.max_participants &&
      scheme.current_participants &&
      scheme.current_participants >= scheme.max_participants
    ) {
      toast.error("This scheme is fully booked");
      return;
    }

    setSchemeToConfirm(scheme);
    setIsConfirming(true);
  };

  const handleConfirm = async () => {
    if (!schemeToConfirm) return;

    const result = await selectScheme({
      installment: schemeToConfirm.installment,
      duration: schemeToConfirm.duration,
      totalAmount: schemeToConfirm.total_amount,
      bonusAmount: schemeToConfirm.bonus_amount,
      totalValue: schemeToConfirm.total_value,
      features: schemeToConfirm.features,
      isActive: schemeToConfirm.is_active,
      maxParticipants: schemeToConfirm.max_participants || undefined,
      currentParticipants: schemeToConfirm.current_participants,
    });

    if (result) {
      setActiveScheme({ scheme: schemeToConfirm } as {
        scheme: Scheme;
        activeScheme: SchemeSelection;
      });
      setSelectedScheme(schemeToConfirm);
      setIsConfirming(false);
      setSchemeToConfirm(null);
    }
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setSchemeToConfirm(null);
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1 },
    }),
  };

  const getStatusBadge = (status: string) => {
    const base = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "active":
        return (
          <span className={`${base} bg-green-100 text-green-700`}>
            On Track
          </span>
        );
      case "delayed":
        return (
          <span className={`${base} bg-red-100 text-red-700`}>Delayed</span>
        );
      case "completed":
        return (
          <span className={`${base} bg-blue-100 text-blue-700`}>Completed</span>
        );
      case "cancelled":
        return (
          <span className={`${base} bg-gray-100 text-gray-700`}>Cancelled</span>
        );
      default:
        return (
          <span className={`${base} bg-gray-100 text-gray-700`}>Pending</span>
        );
    }
  };

  if (isLoadingSchemes) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-orange mx-auto mb-4"></div>
          <p className="text-text/60">Loading schemes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="container mx-auto px-4 py-4">
        <nav className="text-sm" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2">
            <li>
              <Link to="/" className="text-primary hover:text-primary-orange">
                Home
              </Link>
            </li>
            <li className="text-text/60">/</li>
            <li className="text-text/60">Monthly Installment</li>
          </ol>
        </nav>
      </div>

      {/* Hero Section with Slider */}
      <div className="relative h-[400px] mb-12">
        <Swiper
          modules={[Autoplay, Pagination, Navigation]}
          spaceBetween={0}
          slidesPerView={1}
          autoplay={{
            delay: 5000,
            disableOnInteraction: false,
          }}
          pagination={{ clickable: true }}
          navigation
          className="h-full"
          aria-label="Scheme information slideshow"
        >
          {schemeSlides.map((slide) => (
            <SwiperSlide key={slide.id}>
              <div className="relative h-full">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <h1 className="text-4xl font-montserrat font-bold mb-4">
                      {slide.title}
                    </h1>
                    <p className="text-xl">{slide.description}</p>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Scheme Introduction */}
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-montserrat font-bold mb-6">
            Monthly Installment Scheme
          </h2>
          <p className="text-text/60 mb-8">
            Join our exclusive monthly installment scheme and get extra crackers
            as a bonus! Save monthly and enjoy premium crackers during festive
            seasons. Choose your preferred installment amount and get started
            today.
          </p>
          {!user && (
            <Link
              to="/signup"
              className="btn-primary inline-block"
              aria-label="Register for the scheme"
            >
              Register Now
            </Link>
          )}
        </div>
      </div>

      {/* Active Scheme Display */}
      {activeScheme && (
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 flex flex-col gap-4">
            {/* Status Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <h2 className="text-xl font-bold text-gray-800">
                Your Active Scheme
              </h2>
              {getStatusBadge(activeScheme.activeScheme.status || "on_track")}
            </div>

            {/* Scheme Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-600 text-sm">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary-orange" />
                Plan: ₹{activeScheme.scheme.installment} / month ×{" "}
                {activeScheme.scheme.duration} months
              </div>
              <div className="flex items-center gap-2">
                <IndianRupee size={18} className="text-primary-orange" />
                Paid: ₹{activeScheme.activeScheme.amount_paid} / ₹
                {activeScheme.scheme.total_amount}
              </div>
              <div className="flex items-center gap-2">
                <Gift size={18} className="text-primary-orange" />
                Bonus on Completion: ₹{activeScheme.scheme.bonus_amount}
              </div>
              <div className="flex items-center gap-2">
                <CalendarCheck size={18} className="text-primary-orange" />
                Next Due: {activeScheme.activeScheme.next_due_date}
              </div>
              <div className="flex items-center gap-2">
                <CalendarCheck size={18} className="text-primary-orange" />
                Ends{" "}
                {formatDistanceToNow(
                  new Date(activeScheme.activeScheme.end_date),
                  { addSuffix: true }
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-2">
              <label className="text-xs text-gray-500 font-medium mb-1 block">
                Progress
              </label>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="bg-primary-orange h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      Math.round(
                        ((activeScheme.activeScheme.amount_paid || 0) /
                          (parseInt(activeScheme.scheme.total_amount) || 1)) *
                          100
                      ),
                      100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1 block">
                {Math.min(
                  Math.round(
                    ((activeScheme.activeScheme.amount_paid || 0) /
                      parseInt(activeScheme.scheme.total_amount)) *
                      100
                  ),
                  100
                )}
                % completed
              </span>
            </div>

            {/* Action Button */}
            <div className="w-full sm:w-auto">
              <button className="btn-primary w-full sm:w-auto">Pay Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Scheme Details Grid */}
      <div className="max-w-7xl mx-auto px-4 mb-24">
        <h2 className="text-xl font-bold text-gray-800 mb-6">
          Available Schemes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {schemes.map((scheme, index) => (
            <motion.div
              key={scheme.id}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={index}
              className={`relative bg-white border rounded-2xl shadow-md p-4 flex flex-col justify-between transition hover:shadow-lg hover:-translate-y-1 duration-200 ${
                selectedScheme?.id === scheme.id
                  ? "ring-2 ring-primary-orange"
                  : ""
              }`}
            >
              {/* Checkmark icon if selected */}
              {selectedScheme?.id === scheme.id && (
                <CheckCircle
                  className="absolute top-3 right-3 text-primary-orange"
                  size={24}
                />
              )}

              <div>
                <h4 className="text-xl font-semibold text-gray-800 mb-1">
                  ₹{scheme.installment}
                  <span className="text-sm font-medium text-gray-500">
                    {" "}
                    / month
                  </span>
                </h4>

                <div className="flex items-center text-sm text-gray-500 mt-2 gap-1">
                  <Clock size={16} /> Duration: {scheme.duration} months
                </div>

                <div className="flex items-center text-sm text-gray-500 mt-1 gap-1">
                  <Package size={16} /> Total: ₹{scheme.total_amount}
                </div>

                <div className="flex items-center text-sm text-primary-orange mt-2 gap-1 font-semibold">
                  <Gift size={16} /> Bonus: ₹{scheme.bonus_amount}
                </div>

                <div className="flex items-center text-sm font-bold text-gray-800 mt-1 gap-1">
                  <Package size={16} /> Value: ₹{scheme.total_value}
                </div>
              </div>

              <div className="mt-4">
                {user ? (
                  <button
                    onClick={() => handleSchemeSelect(scheme)}
                    className="btn-primary w-full"
                    disabled={isLoading || !scheme.is_active}
                  >
                    {isLoading ? "Processing..." : "Select"}
                  </button>
                ) : (
                  <Link
                    to="/signup"
                    className="btn-primary w-full text-center block"
                  >
                    Register
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="container mx-auto px-4 mb-12">
        <h2 className="text-3xl font-montserrat font-bold text-center mb-8">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-primary-orange">1</span>
            </div>
            <h3 className="font-montserrat font-bold mb-2">Register</h3>
            <p className="text-text/60">
              Create your account and choose your preferred installment amount
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-primary-orange">2</span>
            </div>
            <h3 className="font-montserrat font-bold mb-2">Pay Monthly</h3>
            <p className="text-text/60">
              Make your monthly payments without any hassle through our payment
              options
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-primary-orange">3</span>
            </div>
            <h3 className="font-montserrat font-bold mb-2">Get Bonus</h3>
            <p className="text-text/60">
              Receive your crackers with bonus amount and free delivery
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="container mx-auto px-4 mb-12">
        <h2 className="text-3xl font-montserrat font-bold text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-card/30 p-4 rounded-lg">
            <h3 className="font-montserrat font-bold mb-2">
              What is the minimum installment amount?
            </h3>
            <p className="text-text/60">
              The minimum installment amount is ₹500 per month.
            </p>
          </div>
          <div className="bg-card/30 p-4 rounded-lg">
            <h3 className="font-montserrat font-bold mb-2">
              How long is the installment period?
            </h3>
            <p className="text-text/60">
              The installment period is 10 months, after which you'll receive
              your crackers with bonus amount.
            </p>
          </div>
          <div className="bg-card/30 p-4 rounded-lg">
            <h3 className="font-montserrat font-bold mb-2">
              Is delivery free?
            </h3>
            <p className="text-text/60">
              Yes, delivery is completely free for all scheme participants.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirming && schemeToConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-2xl font-montserrat font-bold mb-4">
              Confirm Scheme Selection
            </h3>
            <p className="mb-6">
              Are you sure you want to select the {schemeToConfirm.installment}{" "}
              monthly installment scheme? This will commit you to paying{" "}
              {schemeToConfirm.installment} for 10 months.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleCancel}
                className="btn-secondary"
                aria-label="Cancel scheme selection"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="btn-primary"
                disabled={isLoading}
                aria-label="Confirm scheme selection"
              >
                {isLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
