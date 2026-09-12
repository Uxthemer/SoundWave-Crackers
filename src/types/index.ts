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
  category: Categories;
  actual_price: number;
  content: string;
  discount_percentage: number;
  offer_price: number;
  description?: string;
  images?: string[];
  rating?: number;
  reviews?: number;
  stock?: number;
  /** Set on a family / combo pack; see {@link CartItem}. */
  is_pack?: boolean;
  pack_components?: PackComponentSummary[];
}

/**
 * A family / combo pack behaves as a product everywhere the cart and the
 * listing are concerned — it has a name, a rate and a struck-out "worth" —
 * so it travels as one. `is_pack` is the single place the difference shows:
 * at checkout the id goes to order_items.combo_pack_id instead of product_id,
 * and the database moves the stock of the products inside it.
 */
export interface PackComponentSummary {
  product_id: string;
  name: string;
  quantity: number;
}

export interface CartItem extends Product {
  quantity: number;
  totalPrice: number;
  is_pack?: boolean;
  pack_components?: PackComponentSummary[];
}

export interface UserDetails {
  name: string;
  email: string;
  phone: string;
  address: {
    doorNo: string;
    floor?: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    country: string;
  };
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
  status: 'enquiry received' | 'payment completed' | 'packing' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: string;
  createdAt: string;
  shippingAddress: {
    doorNo: string;
    floor?: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    country: string;
  };
  customerName: string;
  email?: string;
  phone: string;
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
  order?: number | null;
  yt_link?: string;
}