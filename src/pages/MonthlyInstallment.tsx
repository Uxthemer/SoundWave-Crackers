import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useScheme } from '../hooks/useScheme';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import { supabase } from '../lib/supabase';
import { Database } from '../types/supabase';
import { toast } from 'react-hot-toast';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

type Scheme = Database['public']['Tables']['schemes']['Row'];
type SchemeSelection = Database['public']['Tables']['scheme_selections']['Row'];

const schemeSlides = [
  {
    id: 1,
    image: '/assets/img/schemes/scheme1.jpg',
    title: 'Monthly Savings Scheme',
    description: 'Save monthly and get extra crackers as bonus!'
  },
  {
    id: 2,
    image: '/assets/img/schemes/scheme2.jpg',
    title: 'Flexible Payment Options',
    description: 'Choose your monthly installment amount'
  },
  {
    id: 3,
    image: '/assets/img/schemes/scheme3.jpg',
    title: 'Free Delivery',
    description: 'Get your crackers delivered free of cost'
  }
];

export function MonthlyInstallment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectScheme, getActiveScheme, isLoading, error } = useScheme();
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  const [activeScheme, setActiveScheme] = useState<Scheme | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [schemeToConfirm, setSchemeToConfirm] = useState<Scheme | null>(null);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(true);

  useEffect(() => {
    const fetchSchemes = async () => {
      try {
        const { data, error } = await supabase
          .from('schemes')
          .select('*')
          .eq('is_active', true)
          .order('installment', { ascending: true });

        if (error) throw error;
        setSchemes(data || []);
      } catch (err) {
        console.error('Error fetching schemes:', err);
        toast.error('Failed to load schemes');
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
          setActiveScheme(scheme.schemes);
        }
      }
    };
    fetchActiveScheme();
  }, [user, getActiveScheme]);

  const handleSchemeSelect = (scheme: Scheme) => {
    if (!user) {
      toast.error('Please login to select a scheme');
      navigate('/login');
      return;
    }

    if (activeScheme) {
      toast.error('You already have an active scheme');
      return;
    }

    if (!scheme.is_active) {
      toast.error('This scheme is no longer available');
      return;
    }

    if (scheme.max_participants && scheme.current_participants && 
        scheme.current_participants >= scheme.max_participants) {
      toast.error('This scheme is fully booked');
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
      currentParticipants: schemeToConfirm.current_participants
    });

    if (result) {
      setActiveScheme(schemeToConfirm);
      setSelectedScheme(schemeToConfirm);
      setIsConfirming(false);
      setSchemeToConfirm(null);
    }
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setSchemeToConfirm(null);
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
      <div className="container mx-auto px-4 mb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-montserrat font-bold mb-6">
            Monthly Installment Scheme
          </h2>
          <p className="text-text/60 mb-8">
            Join our exclusive monthly installment scheme and get extra crackers as a bonus! 
            Save monthly and enjoy premium crackers during festive seasons. 
            Choose your preferred installment amount and get started today.
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
        <div className="container mx-auto px-4 mb-12">
          <div className="bg-primary-orange/10 p-6 rounded-lg">
            <h3 className="text-2xl font-montserrat font-bold mb-4">
              Your Active Scheme
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-text/60">Monthly Installment:</p>
                <p className="font-bold">{activeScheme.installment}</p>
              </div>
              <div>
                <p className="text-text/60">Total Value:</p>
                <p className="font-bold">{activeScheme.total_value}</p>
              </div>
              <div>
                <p className="text-text/60">Duration:</p>
                <p className="font-bold">{activeScheme.duration}</p>
              </div>
              <div>
                <p className="text-text/60">Bonus Amount:</p>
                <p className="font-bold text-primary-orange">{activeScheme.bonus_amount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scheme Details Table */}
      <div className="container mx-auto px-4 mb-12">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" role="table" aria-label="Scheme details">
            <thead>
              <tr className="bg-primary-orange/10">
                <th scope="col" className="p-4 text-left">Monthly Installment</th>
                <th scope="col" className="p-4 text-left">Duration</th>
                <th scope="col" className="p-4 text-left">Total Amount</th>
                <th scope="col" className="p-4 text-left">Bonus Amount</th>
                <th scope="col" className="p-4 text-left">Total Value</th>
                <th scope="col" className="p-4 text-left">Features</th>
                <th scope="col" className="p-4 text-left">Availability</th>
                <th scope="col" className="p-4 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {schemes.map((scheme) => (
                <tr
                  key={scheme.id}
                  className={`border-b border-card-border/10 ${
                    selectedScheme?.id === scheme.id
                      ? 'bg-primary-orange/5'
                      : ''
                  }`}
                >
                  <td className="p-4 font-bold">{scheme.installment}</td>
                  <td className="p-4">{scheme.duration}</td>
                  <td className="p-4">{scheme.total_amount}</td>
                  <td className="p-4 text-primary-orange">{scheme.bonus_amount}</td>
                  <td className="p-4 font-bold">{scheme.total_value}</td>
                  <td className="p-4">
                    <ul className="list-disc list-inside">
                      {scheme.features.map((feature, index) => (
                        <li key={index} className="text-sm">{feature}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="p-4">
                    {scheme.max_participants && (
                      <div className="text-sm">
                        <p>{scheme.current_participants}/{scheme.max_participants} participants</p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-primary-orange h-2.5 rounded-full"
                            style={{
                              width: `${(scheme.current_participants / scheme.max_participants) * 100}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {user ? (
                      <button
                        onClick={() => handleSchemeSelect(scheme)}
                        className="btn-primary"
                        disabled={isLoading || !scheme.is_active}
                        aria-label={`Select ${scheme.installment} scheme`}
                      >
                        {isLoading ? 'Processing...' : 'Select'}
                      </button>
                    ) : (
                      <Link
                        to="/signup"
                        className="btn-primary inline-block"
                        aria-label="Register to select scheme"
                      >
                        Register
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              Make your monthly payments through our secure payment gateway
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
              The installment period is 10 months, after which you'll receive your crackers with bonus amount.
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
              Are you sure you want to select the {schemeToConfirm.installment} monthly installment scheme?
              This will commit you to paying {schemeToConfirm.installment} for 10 months.
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
                {isLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 