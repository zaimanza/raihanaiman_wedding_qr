import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_UPLOAD_FILES, type CapturedMedia, type MediaKind, type UploadedMedia } from '../types/media';

interface MemoryContextValue {
  media: CapturedMedia | null;
  uploads: UploadedMedia[];
  addUpload: (media: CapturedMedia, filename: string) => boolean;
  removeUpload: (submissionId: string) => void;
  markUploadSent: (submissionId: string) => void;
  submissionRetryAt: number;
  setSubmissionRetryAt: (time: number) => void;
  guestName: string;
  setGuestName: (name: string) => void;
  wish: string;
  setWish: (wish: string) => void;
  saveMedia: (blob: Blob, kind: MediaKind, downloadBlob: Blob) => void;
  clearDraft: () => void;
}

const MemoryContext = createContext<MemoryContextValue | null>(null);

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [uploads, setUploads] = useState<UploadedMedia[]>([]);
  const uploadsRef = useRef<UploadedMedia[]>([]);
  const [guestName, setGuestName] = useState('');
  const [wish, setWish] = useState('');
  const [submissionRetryAt, setSubmissionRetryAt] = useState(0);
  const urlRef = useRef<string | null>(null);

  const clearDraft = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    uploadsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
    uploadsRef.current = [];
    setUploads([]);
    setMedia(null);
    setWish('');
    setGuestName('');
    setSubmissionRetryAt(0);
  }, []);

  const addUpload = useCallback((item: CapturedMedia, filename: string) => {
    if (uploadsRef.current.length >= MAX_UPLOAD_FILES || uploadsRef.current.some(item => item.sent)) {
      URL.revokeObjectURL(item.previewUrl);
      return false;
    }
    uploadsRef.current = [...uploadsRef.current, { ...item, filename, sent: false }];
    setUploads(uploadsRef.current);
    return true;
  }, []);

  const removeUpload = useCallback((submissionId: string) => {
    if (uploadsRef.current.some(item => item.sent)) return;
    const item = uploadsRef.current.find(item => item.submissionId === submissionId);
    if (item) URL.revokeObjectURL(item.previewUrl);
    uploadsRef.current = uploadsRef.current.filter(item => item.submissionId !== submissionId);
    setUploads(uploadsRef.current);
  }, []);

  const markUploadSent = useCallback((submissionId: string) => {
    uploadsRef.current = uploadsRef.current.map(item => item.submissionId === submissionId ? { ...item, sent: true } : item);
    setUploads(uploadsRef.current);
  }, []);

  const saveMedia = useCallback((blob: Blob, kind: MediaKind, downloadBlob: Blob) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    uploadsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
    uploadsRef.current = [];
    setUploads([]);
    const previewUrl = URL.createObjectURL(downloadBlob);
    urlRef.current = previewUrl;
    setMedia({ kind, blob, downloadBlob, previewUrl, submissionId: crypto.randomUUID() });
    setWish('');
    setGuestName('');
  }, []);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    uploadsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }, []);

  return <MemoryContext.Provider value={{ media, uploads, addUpload, removeUpload, markUploadSent, submissionRetryAt, setSubmissionRetryAt, guestName, setGuestName, wish, setWish, saveMedia, clearDraft }}>{children}</MemoryContext.Provider>;
}

export function useMemory() {
  const context = useContext(MemoryContext);
  if (!context) throw new Error('MemoryProvider is required');
  return context;
}
