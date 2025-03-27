import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

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

const schemeDetails = [
  {
    installment: '₹500',
    duration: '10 months',
    totalAmount: '₹5,000',
    bonusAmount: '₹500',
    totalValue: '₹5,500',
    features: ['Free Delivery', 'Bonus Crackers', 'Flexible Payment']
  },
  {
    installment: '₹1,000',
    duration: '10 months',
    totalAmount: '₹10,000',
    bonusAmount: '₹1,000',
    totalValue: '₹11,000',
    features: ['Free Delivery', 'Bonus Crackers', 'Priority Support']
  },
  {
    installment: '₹2,500',
    duration: '10 months',
    totalAmount: '₹25,000',
    bonusAmount: '₹2,500',
    totalValue: '₹27,500',
    features: ['Free Delivery', 'Premium Crackers', 'VIP Support']
  },
  {
    installment: '₹5,000',
    duration: '10 months',
    totalAmount: '₹50,000',
    bonusAmount: '₹5,000',
    totalValue: '₹55,000',
    features: ['Free Delivery', 'Premium Crackers', 'VIP Support', 'Early Access']
  }
];

export function MonthlyInstallment() {
  const { user } = useAuth();
  const [selectedScheme, setSelectedScheme] = useState(schemeDetails[0]);

  return (
    <div className="min-h-screen bg-background">
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
        >
          {schemeSlides.map((slide) => (
            <SwiperSlide key={slide.id}>
              <div className="relative h-full">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
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
            >
              Register Now
            </Link>
          )}
        </div>
      </div>

      {/* Scheme Details Table */}
      <div className="container mx-auto px-4 mb-12">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-primary-orange/10">
                <th className="p-4 text-left">Monthly Installment</th>
                <th className="p-4 text-left">Duration</th>
                <th className="p-4 text-left">Total Amount</th>
                <th className="p-4 text-left">Bonus Amount</th>
                <th className="p-4 text-left">Total Value</th>
                <th className="p-4 text-left">Features</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {schemeDetails.map((scheme) => (
                <tr
                  key={scheme.installment}
                  className={`border-b border-card-border/10 ${
                    selectedScheme.installment === scheme.installment
                      ? 'bg-primary-orange/5'
                      : ''
                  }`}
                >
                  <td className="p-4 font-bold">{scheme.installment}</td>
                  <td className="p-4">{scheme.duration}</td>
                  <td className="p-4">{scheme.totalAmount}</td>
                  <td className="p-4 text-primary-orange">{scheme.bonusAmount}</td>
                  <td className="p-4 font-bold">{scheme.totalValue}</td>
                  <td className="p-4">
                    <ul className="list-disc list-inside">
                      {scheme.features.map((feature, index) => (
                        <li key={index} className="text-sm">{feature}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="p-4">
                    {user ? (
                      <button
                        onClick={() => setSelectedScheme(scheme)}
                        className="btn-primary"
                      >
                        Select
                      </button>
                    ) : (
                      <Link
                        to="/signup"
                        className="btn-primary inline-block"
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
    </div>
  );
} 