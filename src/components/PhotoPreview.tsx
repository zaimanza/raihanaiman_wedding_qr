import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function PhotoPreview({ src, onClose, returnFocusTo }: { src: string; onClose: () => void; returnFocusTo: HTMLButtonElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      returnFocusTo?.focus();
    };
  }, [returnFocusTo]);

  return (
    <dialog ref={dialog} id="photo-preview" className="photo-preview-dialog" aria-label="Photo preview" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
      }
    }}>
      <button type="button" className="photo-preview-close" aria-label="Close photo preview" onClick={onClose} autoFocus><Icon name="close" /></button>
      <img className="photo-preview-image" src={src} alt="Your captured wedding memory, enlarged" />
    </dialog>
  );
}
