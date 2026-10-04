import { useEffect } from 'react';
import { Icon } from './Icon';

export function FloatingToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 6500);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return <div className="floating-toast" role="alert"><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" /></button></div>;
}
