import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMemory } from '../context/MemoryContext';

export function RequireMemory({ children }: { children: ReactNode }) {
  return useMemory().media ? children : <Navigate to="/" replace />;
}
