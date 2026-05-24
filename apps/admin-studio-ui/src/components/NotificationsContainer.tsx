/**
 * NotificationsContainer — renders toast notifications from the global store.
 * Supports success, error, info, warning types with auto-dismiss.
 */
import { useNotifications } from '../stores/notifications.js';

export function NotificationsContainer() {
  const notifications = useNotifications((s) => s.notifications);
  const remove = useNotifications((s) => s.remove);

  const bgClasses = {
    success: 'bg-emerald-900/90 border-emerald-700 text-emerald-100',
    error: 'bg-red-900/90 border-red-700 text-red-100',
    info: 'bg-blue-900/90 border-blue-700 text-blue-100',
    warning: 'bg-amber-900/90 border-amber-700 text-amber-100',
  };

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((n) => (
        <div
          key={n.id}
          role="alert"
          className={`rounded-lg border px-4 py-3 backdrop-blur-sm ${bgClasses[n.type]}`}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg" aria-hidden="true">
              {icons[n.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{n.title}</div>
              {n.message && <div className="text-xs mt-1 opacity-90">{n.message}</div>}
            </div>
            <button
              onClick={() => remove(n.id)}
              className="text-lg leading-none opacity-60 hover:opacity-100 transition"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
