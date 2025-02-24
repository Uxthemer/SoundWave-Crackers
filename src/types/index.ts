export interface Product {
  id: number;
  name: string;
  image: string;
  category: string;
  actualPrice: number;
  content: string;
  discount: number;
  offerPrice: number;
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