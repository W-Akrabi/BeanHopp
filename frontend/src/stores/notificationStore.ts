import { create } from 'zustand';
import api from '../lib/api';

export interface Notification {
  id: string;
  user_id?: string;
  title: string;
  message: string;
  type: 'order' | 'promo' | 'reward' | 'gift' | 'system';
  data?: Record<string, any>;
  read: boolean;
  created_at: string;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  
  // Actions
  fetchNotifications: (userId: string) => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'created_at'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async (userId: string) => {
    set({ loading: true });
    try {
      const response = await api.get(`/notifications/${userId}`);
      const notifications = response.data || [];
      set({ 
        notifications,
        unreadCount: notifications.filter((n: Notification) => !n.read).length,
        loading: false 
      });
    } catch (error) {
      console.log('Error fetching notifications:', error);
      set({ loading: false });
    }
  },

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
    };
    
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    }));
  },

  markAsRead: (id: string) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id);
      const wasUnread = notification && !notification.read;
      
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: wasUnread ? state.unreadCount - 1 : state.unreadCount,
      };
    });
    
    // Sync with backend
    api.patch(`/notifications/${id}/read`).catch(console.log);
  },

  markAllAsRead: () => {
    const { notifications } = get();
    const userId = notifications[0]?.user_id;
    
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    
    // Sync with backend
    if (userId) {
      api.patch(`/notifications/${userId}/read-all`).catch(console.log);
    }
  },

  clearNotification: (id: string) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id);
      const wasUnread = notification && !notification.read;
      
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },
}));
