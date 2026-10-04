import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMemory } from '../context/MemoryContext';

export function RequireUploads({ children }: { children: ReactNode }) {
  return useMemory().uploads.length ? children : <Navigate to="/upload" replace />;
}
