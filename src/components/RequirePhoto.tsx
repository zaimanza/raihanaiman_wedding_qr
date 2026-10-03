import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePhoto } from '../context/PhotoContext';

export function RequirePhoto({ children }: { children: ReactNode }) {
  return usePhoto().photo ? children : <Navigate to="/" replace />;
}
