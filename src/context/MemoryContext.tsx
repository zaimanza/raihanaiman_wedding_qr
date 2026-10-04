import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CapturedMedia, MediaKind } from '../types/media';

interface MemoryContextValue {
  media: CapturedMedia | null;
  wish: string;
  setWish: (wish: string) => void;
  saveMedia: (blob: Blob, kind: MediaKind, downloadBlob: Blob) => void;
  clearDraft: () => void;
}

const MemoryContext = createContext<MemoryContextValue | null>(null);

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [wish, setWish] = useState('');
  const urlRef = useRef<string | null>(null);

  const clearDraft = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setMedia(null);
    setWish('');
  }, []);

  const saveMedia = useCallback((blob: Blob, kind: MediaKind, downloadBlob: Blob) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const previewUrl = URL.createObjectURL(downloadBlob);
    urlRef.current = previewUrl;
    setMedia({ kind, blob, downloadBlob, previewUrl, submissionId: crypto.randomUUID() });
    setWish('');
  }, []);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return <MemoryContext.Provider value={{ media, wish, setWish, saveMedia, clearDraft }}>{children}</MemoryContext.Provider>;
}

export function useMemory() {
  const context = useContext(MemoryContext);
  if (!context) throw new Error('MemoryProvider is required');
  return context;
}
