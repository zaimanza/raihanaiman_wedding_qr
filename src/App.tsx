import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { PhotoProvider } from './context/PhotoContext';
import { RequirePhoto } from './components/RequirePhoto';
import { CameraPage } from './pages/CameraPage';
import { SummaryPage } from './pages/SummaryPage';

const router = createBrowserRouter([
  { path: '/', element: <CameraPage /> },
  { path: '/summary', element: <RequirePhoto><SummaryPage /></RequirePhoto> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return <PhotoProvider><RouterProvider router={router} /></PhotoProvider>;
}
