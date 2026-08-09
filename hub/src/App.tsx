import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BackToTop } from '@/components/BackToTop';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';

// Lazy-loaded pages for code splitting
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);
const ExplorePage = lazy(() =>
  import('@/pages/ExplorePage').then((m) => ({ default: m.ExplorePage }))
);
const MyToolsPage = lazy(() =>
  import('@/pages/MyToolsPage').then((m) => ({ default: m.MyToolsPage }))
);
const ToolDetailPage = lazy(() =>
  import('@/pages/ToolDetailPage').then((m) => ({ default: m.ToolDetailPage }))
);
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);

function PageLoading() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '1rem',
      }}
    >
      <LoadingSpinner size="lg" />
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        页面加载中...
      </p>
    </div>
  );
}

// 登录守卫：未登录跳转登录页，登录后返回原页面
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Header />
        <main className="main-content">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/my-tools" element={<RequireAuth><MyToolsPage /></RequireAuth>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/tool/:toolId" element={<ToolDetailPage />} />
              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="container section text-center">
                    <div
                      className="card p-8 narrow-card"
                    >
                      <div className="empty-state__icon">🔮</div>
                      <h1>404</h1>
                      <p className="text-muted">页面未找到</p>
                      <a href="/" className="btn btn-primary mt-4" style={{ display: 'inline-flex' }}>
                        回到首页
                      </a>
                    </div>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <Footer />
        <BackToTop />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
