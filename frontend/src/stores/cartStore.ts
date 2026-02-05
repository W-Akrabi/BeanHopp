import { create } from 'zustand';

export interface CartItem {
  id: string;
  menuItemId: string;
  shopId: string;
  shopName: string;
  name: string;
  price: number;
  quantity: number;
  customizations: Record<string, string>;
  imageUrl?: string;
}

interface CartState {
  items: CartItem[];
  shopId: string | null;
  shopName: string | null;
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  shopId: null,
  shopName: null,

  addItem: (item) => {
    const { items, shopId } = get();
    
    // If cart has items from different shop, clear first
    if (shopId && shopId !== item.shopId) {
      set({ items: [], shopId: item.shopId, shopName: item.shopName });
    }

    // Check if same item with same customizations exists
    const existingIndex = items.findIndex(
      (i) =>
        i.menuItemId === item.menuItemId &&
        JSON.stringify(i.customizations) === JSON.stringify(item.customizations)
    );

    if (existingIndex >= 0) {
      const updatedItems = [...items];
      updatedItems[existingIndex].quantity += item.quantity;
      set({ items: updatedItems });
    } else {
      const newItem: CartItem = {
        ...item,
        id: `${item.menuItemId}-${Date.now()}`,
      };
      set({
        items: [...items, newItem],
        shopId: item.shopId,
        shopName: item.shopName,
      });
    }
  },

  removeItem: (id) => {
    const items = get().items.filter((item) => item.id !== id);
    if (items.length === 0) {
      set({ items: [], shopId: null, shopName: null });
    } else {
      set({ items });
    }
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id);
      return;
    }
    const items = get().items.map((item) =>
      item.id === id ? { ...item, quantity } : item
    );
    set({ items });
  },

  clearCart: () => set({ items: [], shopId: null, shopName: null }),

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  getTax: () => {
    return get().getSubtotal() * 0.13; // 13% Ontario tax
  },

  getTotal: () => {
    return get().getSubtotal() + get().getTax();
  },

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
