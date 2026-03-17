import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui';
import { useAuthStore } from './store/auth.store';

// Lazy load pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SetupWizardPage = lazy(() => import('./pages/SetupWizardPage'));
const FilesPage = lazy(() => import('./pages/FilesPage'));
const RecentsPage = lazy(() => import('./pages/RecentsPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const SharedPage = lazy(() => import('./pages/SharedPage'));
const PhotosPage = lazy(() => import('./pages/PhotosPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SharePublicPage = lazy(() => import('./pages/SharePublicPage'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  if (user?.role !== 'admin') {
    return <Navigate to="/files" replace />;
  }

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupWizardPage />} />
        <Route path="/s/:token" element={<SharePublicPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Navigate to="/files" replace />
            </ProtectedRoute>
          }
        />

        <Route
          path="/files"
          element={
            <ProtectedRoute>
              <AppShell>
                <FilesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/files/:folderId"
          element={
            <ProtectedRoute>
              <AppShell>
                <FilesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/recents"
          element={
            <ProtectedRoute>
              <AppShell>
                <RecentsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/favorites"
          element={
            <ProtectedRoute>
              <AppShell>
                <FavoritesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/shared"
          element={
            <ProtectedRoute>
              <AppShell>
                <SharedPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/photos"
          element={
            <ProtectedRoute>
              <AppShell>
                <PhotosPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/trash"
          element={
            <ProtectedRoute>
              <AppShell>
                <TrashPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppShell>
                <SettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AppShell>
                  <AdminPage />
                </AppShell>
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/files" replace />} />
      </Routes>
    </Suspense>
  );
}
