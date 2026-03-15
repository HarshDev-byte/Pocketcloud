import React, { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import AppLayout from './components/Layout/AppLayout';

// Lazy load pages for code splitting
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const FilesPage = React.lazy(() => import('./pages/FilesPage'));
const TrashPage = React.lazy(() => import('./pages/TrashPage').then(module => ({ default: module.TrashPage })));
const SetupWizard = React.lazy(() => import('./pages/SetupWizard'));
const ConnectGuidePage = React.lazy(() => import('./pages/ConnectGuidePage').then(module => ({ default: module.ConnectGuidePage })));
const UploadShareTarget = React.lazy(() => import('./pages/UploadShareTarget').then(module => ({ default: module.UploadShareTarget })));
const GetClientPage = React.lazy(() => import('./pages/GetClientPage').then(module => ({ default: module.GetClientPage })));
const DeveloperPage = React.lazy(() => import('./pages/DeveloperPage'));
const WebhooksPage = React.lazy(() => import('./pages/WebhooksPage'));

// Admin pages (lazy loaded)
const AdminLayout = React.lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = React.lazy(() => import('./pages/admin/AdminUsers'));
const AdminStorage = React.lazy(() => import('./pages/admin/AdminStorage'));
const AdminLogs = React.lazy(() => import('./pages/admin/AdminLogs'));
const AdminSystem = React.lazy(() => import('./pages/admin/AdminSystem'));
const AdminSettings = React.lazy(() => import('./pages/admin/AdminSettings'));

// Loading component
const PageLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isInitialized } = useAuthStore();

  // Show loading while checking auth
  if (!isInitialized) {
    return <PageLoader />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  );
};

// Admin Route component (requires admin role)
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isInitialized } = useAuthStore();

  // Show loading while checking auth
  if (!isInitialized) {
    return <PageLoader />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to files if not admin
  if (user.role !== 'admin') {
    return <Navigate to="/files" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  );
};

// Placeholder components for routes not yet implemented
const SharedPage: React.FC = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Shared Files</h1>
    <p className="text-gray-600 dark:text-gray-400">Shared files will be displayed here.</p>
  </div>
);

const SettingsPage: React.FC = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Settings</h1>
    <p className="text-gray-600 dark:text-gray-400">Settings will be displayed here.</p>
  </div>
);

// Router configuration
export const router = createBrowserRouter([
  {
    path: '/setup',
    element: (
      <Suspense fallback={<PageLoader />}>
        <SetupWizard />
      </Suspense>
    ),
  },
  {
    path: '/get',
    element: (
      <Suspense fallback={<PageLoader />}>
        <GetClientPage />
      </Suspense>
    ),
  },
  {
    path: '/connect',
    element: (
      <Suspense fallback={<PageLoader />}>
        <ConnectGuidePage />
      </Suspense>
    ),
  },
  {
    path: '/upload-share',
    element: (
      <Suspense fallback={<PageLoader />}>
        <UploadShareTarget />
      </Suspense>
    ),
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/files" replace />,
      },
      {
        path: 'files',
        element: <FilesPage />,
      },
      {
        path: 'files/:folderId',
        element: <FilesPage />,
      },
      {
        path: 'shared',
        element: <SharedPage />,
      },
      {
        path: 'trash',
        element: <TrashPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'developer',
        element: <DeveloperPage />,
      },
      {
        path: 'webhooks',
        element: <WebhooksPage />,
      },
    ],
  },
  {
    path: '/admin',
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/admin/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <AdminDashboard />,
      },
      {
        path: 'users',
        element: <AdminUsers />,
      },
      {
        path: 'storage',
        element: <AdminStorage />,
      },
      {
        path: 'logs',
        element: <AdminLogs />,
      },
      {
        path: 'system',
        element: <AdminSystem />,
      },
      {
        path: 'settings',
        element: <AdminSettings />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/files" replace />,
  },
]);