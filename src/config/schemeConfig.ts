import { SchemeSlide, SchemeDetails } from '../types/scheme';

export const schemeSlides: SchemeSlide[] = [
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

export const schemeDetails: SchemeDetails[] = [
  {
    installment: '₹500',
    duration: '10 months',
    totalAmount: '₹5,000',
    bonusAmount: '₹500',
    totalValue: '₹5,500',
    features: ['Free Delivery', 'Bonus Crackers', 'Flexible Payment'],
    isActive: true,
    maxParticipants: 100,
    currentParticipants: 45
  },
  {
    installment: '₹1,000',
    duration: '10 months',
    totalAmount: '₹10,000',
    bonusAmount: '₹1,000',
    totalValue: '₹11,000',
    features: ['Free Delivery', 'Bonus Crackers', 'Priority Support'],
    isActive: true,
    maxParticipants: 75,
    currentParticipants: 30
  },
  {
    installment: '₹2,500',
    duration: '10 months',
    totalAmount: '₹25,000',
    bonusAmount: '₹2,500',
    totalValue: '₹27,500',
    features: ['Free Delivery', 'Premium Crackers', 'VIP Support'],
    isActive: true,
    maxParticipants: 50,
    currentParticipants: 20
  },
  {
    installment: '₹5,000',
    duration: '10 months',
    totalAmount: '₹50,000',
    bonusAmount: '₹5,000',
    totalValue: '₹55,000',
    features: ['Free Delivery', 'Premium Crackers', 'VIP Support', 'Early Access'],
    isActive: true,
    maxParticipants: 25,
    currentParticipants: 10
  }
]; 