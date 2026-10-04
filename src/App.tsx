import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { MemoryProvider } from './context/MemoryContext';
import { RequireMemory } from './components/RequireMemory';
import { CameraPage } from './pages/CameraPage';
import { SummaryPage } from './pages/SummaryPage';

const router = createBrowserRouter([
  { path: '/', element: <CameraPage /> },
  { path: '/summary', element: <RequireMemory><SummaryPage /></RequireMemory> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return <MemoryProvider><RouterProvider router={router} /></MemoryProvider>;
}
