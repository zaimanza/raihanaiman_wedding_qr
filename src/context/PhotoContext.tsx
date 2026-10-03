import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CapturedPhoto } from '../types/photo';

interface PhotoContextValue {
  photo: CapturedPhoto | null;
  wish: string;
  setWish: (wish: string) => void;
  savePhoto: (blob: Blob) => void;
  clearDraft: () => void;
}

const PhotoContext = createContext<PhotoContextValue | null>(null);

export function PhotoProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [wish, setWish] = useState('');
  const urlRef = useRef<string | null>(null);

  const clearDraft = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setWish('');
  }, []);

  const savePhoto = useCallback((blob: Blob) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const previewUrl = URL.createObjectURL(blob);
    urlRef.current = previewUrl;
    setPhoto({ blob, previewUrl, submissionId: crypto.randomUUID() });
    setWish('');
  }, []);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return <PhotoContext.Provider value={{ photo, wish, setWish, savePhoto, clearDraft }}>{children}</PhotoContext.Provider>;
}

export function usePhoto() {
  const context = useContext(PhotoContext);
  if (!context) throw new Error('PhotoProvider is required');
  return context;
}
