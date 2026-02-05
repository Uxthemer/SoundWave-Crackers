import create from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, Product } from '../types';
import { QuotationWithItems } from '../types/quotation';

export interface DeliveryDetailsState {
  customerName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  referralPhone: string;
  address: string;
  city: string;
  state: string;
  district: string;
  pincode: string;
  country: string;
}

type CartStore = {
  items: CartItem[];
  totalQuantity: number;
  totalAmount: number;
  totalActualAmount: number;
  editingQuotationId: string | null; // Track if we are editing a quotation
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  loadQuotation: (quotation: QuotationWithItems) => void;
  clearQuotationMode: () => void;
  // delivery state
  delivery: DeliveryDetailsState;
  setDelivery: (payload: Partial<DeliveryDetailsState>) => void;
  setDeliveryField: <K extends keyof DeliveryDetailsState>(key: K, value: DeliveryDetailsState[K]) => void;
  clearDelivery: () => void;
  // UI State
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

// Wrap your store with persist and use sessionStorage
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      totalQuantity: 0,
      totalAmount: 0,
      totalActualAmount: 0,
      editingQuotationId: null,
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
                totalQuantity: Math.max(0, state.totalQuantity + quantity),
                totalAmount: updatedItems.reduce((sum, item) => sum + (item.offer_price * item.quantity), 0),
                totalActualAmount: updatedItems.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0),
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
              totalQuantity: Math.max(0, state.totalQuantity + quantity),
              totalAmount: updatedItems.reduce((sum, item) => sum + (item.offer_price * item.quantity), 0),
              totalActualAmount: updatedItems.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0),
            };
          }

          if (quantity <= 0) return state;

          const newItem: CartItem = {
            ...product,
            quantity,
            totalPrice: quantity * product.offer_price,
          };

          const updatedItems = [...state.items, newItem];
          return {
            items: updatedItems,
            totalQuantity: state.totalQuantity + quantity,
            totalAmount: updatedItems.reduce((sum, item) => sum + (item.offer_price * item.quantity), 0),
            totalActualAmount: updatedItems.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0),
          };
        }),
      removeFromCart: (productId) =>
        set((state) => {
          const itemToRemove = state.items.find((item) => item.id === productId);
          if (!itemToRemove) return state;

          const updatedItems = state.items.filter((item) => item.id !== productId);
          return {
            items: updatedItems,
            totalQuantity: Math.max(0, state.totalQuantity - itemToRemove.quantity),
            totalAmount: updatedItems.reduce((sum, item) => sum + (item.offer_price * item.quantity), 0),
            totalActualAmount: updatedItems.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0),
          };
        }),
      updateQuantity: (productId, quantity) =>
        set((state) => {
          if (quantity < 0) return state;

          const updatedItems = state.items.map((item) =>
            item.id === productId
              ? { ...item, quantity, totalPrice: quantity * item.offer_price }
              : item
          ).filter(item => item.quantity > 0); // Remove items with 0 quantity

          return {
            items: updatedItems,
            totalQuantity: updatedItems.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: updatedItems.reduce((sum, item) => sum + (item.offer_price * item.quantity), 0),
            totalActualAmount: updatedItems.reduce((sum, item) => sum + (item.actual_price * item.quantity), 0),
          };
        }),
      clearCart: () => set({ items: [], totalQuantity: 0, totalAmount: 0, totalActualAmount: 0, editingQuotationId: null }),
      loadQuotation: (quotation) => {
        // Map items from quotation using the joined 'product' data
        const cartItems: CartItem[] = quotation.items.map((qItem: any) => {
           // qItem.product is the joined product object
           // We need to construct a CartItem which is Product & { quantity, totalPrice }
           const product = qItem.product; 
           if (!product) return null; // Should not happen if data integrity is good

           return {
             ...product,
             quantity: qItem.quantity,
             // Use stored prices from quotation item to respect the quote
             offer_price: qItem.price,
             totalPrice: qItem.total_price
           };
        }).filter(item => item !== null) as CartItem[];

        set({
          editingQuotationId: quotation.id,
          items: cartItems,
          totalQuantity: cartItems.reduce((sum, item) => sum + item.quantity, 0),
          totalAmount: quotation.total_amount,
          totalActualAmount: cartItems.reduce((sum, item) => sum + ((item.actual_price || item.price) * item.quantity), 0),
          delivery: {
            customerName: quotation.customer_name || "",
            email: quotation.email || "",
            phone: quotation.phone || "",
            alternatePhone: "",
            referralPhone: "",
            address: quotation.address || "",
            city: quotation.city || "",
            state: quotation.state || "",
            district: "",
            pincode: quotation.pincode || "",
            country: "India",
          },
          isCartOpen: true
        });
      },
      clearQuotationMode: () => set({ editingQuotationId: null }),
      // delivery defaults
      delivery: {
        customerName: "",
        email: "",
        phone: "",
        alternatePhone: "",
        referralPhone: "",
        address: "",
        city: "",
        state: "",
        district: "",
        pincode: "",
        country: "India",
      },
      setDelivery: (payload) =>
        set((state) => ({ delivery: { ...state.delivery, ...payload } })),
      setDeliveryField: (key, value) =>
        set((state) => ({ delivery: { ...state.delivery, [key]: value } })),
      clearDelivery: () =>
        set(() => ({
          delivery: {
            customerName: "",
            email: "",
            phone: "",
            alternatePhone: "",
            referralPhone: "",
            address: "",
            city: "",
            state: "",
            district: "",
            pincode: "",
            country: "India",
          },
        })),
        
      isCartOpen: false,
      openCart: () => set({ isCartOpen: true }),
      closeCart: () => set({ isCartOpen: false }),
      toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
    }),
    {
      name: "cart-storage",
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
      partialize: (state) => ({
        // persist cart items and delivery only (adjust as needed)
        items: state.items,
        delivery: state.delivery,
        editingQuotationId: state.editingQuotationId
        // Do NOT persist isCartOpen
      } as unknown as CartStore),
    }
  )
);