export interface SchemeSlide {
  id: number;
  image: string;
  title: string;
  description: string;
}

export interface SchemeFeature {
  id: string;
  title: string;
  description: string;
}

export interface SchemeDetails {
  installment: string;
  duration: string;
  totalAmount: string;
  bonusAmount: string;
  totalValue: string;
  features: string[];
  isActive: boolean;
  maxParticipants?: number;
  currentParticipants?: number;
}

export interface SchemeSelection {
  schemeId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'completed' | 'cancelled';
  payments: Payment[];
}

export interface Payment {
  id: string;
  amount: number;
  date: Date;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
} 