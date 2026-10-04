import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function MediaPreview({ src, kind, onClose, returnFocusTo }: { src: string; kind: 'photo' | 'video'; onClose: () => void; returnFocusTo: HTMLButtonElement | null }) {
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
    <dialog ref={dialog} id="media-preview" className="photo-preview-dialog" aria-label={`${kind === 'photo' ? 'Photo' : 'Video'} preview`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
      if (event.key === 'Tab' && kind === 'photo') {
        event.preventDefault();
        event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
      }
    }}>
      <button type="button" className="photo-preview-close" aria-label={`Close ${kind} preview`} onClick={onClose} autoFocus><Icon name="close" /></button>
      {kind === 'photo' ? <img className="photo-preview-image" src={src} alt="Your captured wedding memory, enlarged" />
        : <video className="photo-preview-image" src={src} controls autoPlay playsInline preload="auto" aria-label="Your recorded wedding memory" />}
    </dialog>
  );
}
