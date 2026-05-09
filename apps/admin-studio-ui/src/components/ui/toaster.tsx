import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-popover text-popover-foreground',
        },
      }}
    />
  );
}
