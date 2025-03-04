export interface Categories{
    id: string;
    name: string;
    cateDescription: string | null;
    image_url: string | null;
    created_at: string;
}

export interface Product extends Categories{
  id: string;
  name: string;
  image: string;
  category: string;
  actual_price: number;
  content: string;
  discount_percentage: number;
  offer_price: number;
  description?: string;
  images?: string[];
  rating?: number;
  reviews?: number;
  stock?: number;
}

export interface CartItem extends Product {
  quantity: number;
  totalPrice: number;
}

export interface UserDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OtpVerification {
  phone: string;
  otp: string;
  verified: boolean;
  expiresAt: Date;
}

export interface Order {
  id: string;
  userId: string;
  totalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  paymentMethod: string;
  createdAt: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: number;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface DashboardStats {
  totalOrders: number;
  totalUsers: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface ProductImport {
  name: string;
  category: string;
  actualPrice: number;
  offerPrice: number;
  discount: number;
  content: string;
  stock: number;
  description?: string;
}