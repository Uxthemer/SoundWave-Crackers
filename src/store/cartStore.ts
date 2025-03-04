import { create } from 'zustand';
import { CartItem, Product } from '../types';

interface CartStore {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  totalQuantity: 0,
  totalAmount: 0,
  addToCart: (product, quantity) =>
    set((state) => {
      const existingItem = state.items.find((item) => item.id === product.id);
      
      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity <= 0) {
          // Remove item if quantity becomes 0 or negative
          const updatedItems = state.items.filter((item) => item.id !== product.id);
          return {
            items: updatedItems,
            totalQuantity: state.totalQuantity + quantity,
            totalAmount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
          };
        }
        
        const updatedItems = state.items.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: newQuantity,
                totalPrice: newQuantity * item.offer_price,
              }
            : item
        );
        return {
          items: updatedItems,
          totalQuantity: state.totalQuantity + quantity,
          totalAmount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        };
      }

      if (quantity <= 0) return state;

      const newItem: CartItem = {
        ...product,
        quantity,
        totalPrice: quantity * product.offer_price,
      };

      return {
        items: [...state.items, newItem],
        totalQuantity: state.totalQuantity + quantity,
        totalAmount: state.totalAmount + newItem.totalPrice,
      };
    }),
  removeFromCart: (productId) =>
    set((state) => {
      const itemToRemove = state.items.find((item) => item.id === productId);
      if (!itemToRemove) return state;

      const updatedItems = state.items.filter((item) => item.id !== productId);
      return {
        items: updatedItems,
        totalQuantity: state.totalQuantity - itemToRemove.quantity,
        totalAmount: state.totalAmount - itemToRemove.totalPrice,
      };
    }),
  updateQuantity: (productId, quantity) =>
    set((state) => {
      const updatedItems = state.items.map((item) =>
        item.id === productId
          ? { ...item, quantity, totalPrice: quantity * item.offer_price }
          : item
      );

      return {
        items: updatedItems,
        totalQuantity: updatedItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
      };
    }),
  clearCart: () => set({ items: [], totalQuantity: 0, totalAmount: 0 }),
}));