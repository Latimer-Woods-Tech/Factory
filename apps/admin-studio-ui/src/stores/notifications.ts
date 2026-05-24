import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms; null = persistent
}

interface NotificationState {
  notifications: Notification[];
  add: (notification: Omit<Notification, 'id'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let nextId = 0;

export const useNotifications = create<NotificationState>((set) => ({
  notifications: [],

  add: (notification) => {
    const id = String(nextId++);
    const withId = { ...notification, id };
    set((state) => ({ notifications: [...state.notifications, withId] }));

    // Auto-remove after duration
    if (notification.duration !== null) {
      const timeout = notification.duration ?? 3000;
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, timeout);
    }
  },

  remove: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clear: () => {
    set({ notifications: [] });
  },
}));
