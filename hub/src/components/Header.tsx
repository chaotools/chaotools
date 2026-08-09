import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: '首页', no: '01' },
  { path: '/explore', label: '探索', no: '02' },
  { path: '/my-tools', label: '我的工具', no: '03' },
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavClick = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  return (
    <header
      className={`header ${scrolled ? 'header--scrolled' : ''}`}
      role="banner"
    >
      <div className="container header__inner">
        {/* Logo */}
        <Link to="/" className="header__logo" aria-label="Chaotools 首页">
          <img src="/ct-icon.png" alt="CT" className="header__logo-img" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span className="header__logo-text">Chaotools</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="header__nav" role="navigation" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`header__nav-link ${
                location.pathname === item.path ? 'header__nav-link--active' : ''
              }`}
              onClick={handleNavClick}
            >
              <span className="header__nav-no">{item.no}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="header__actions">
          {/* Auth */}
          {user ? (
            <div className="header__user">
              <span className="header__user-name" title={user.email}>
                {user.name}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleLogout}
                title="退出登录"
              >
                登出
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="btn btn-ghost btn-sm header__login-btn"
            >
              登录
            </Link>
          )}

          {/* Theme Toggle */}
          <button
            className="btn btn-icon btn-ghost header__theme-btn"
            onClick={toggleTheme}
            aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
            title={isDark ? '浅色模式' : '深色模式'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className="btn btn-icon btn-ghost header__menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={mobileMenuOpen}
          >
            <span className={`header__hamburger ${mobileMenuOpen ? 'is-open' : ''}`}>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="header__mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile Navigation */}
      <nav
        className={`header__mobile-nav ${mobileMenuOpen ? 'is-open' : ''}`}
        role="navigation"
        aria-label="移动端导航"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`header__mobile-link ${
              location.pathname === item.path ? 'header__mobile-link--active' : ''
            }`}
            onClick={handleNavClick}
          >
            <span className="header__nav-no">{item.no}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <style>{`
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: var(--z-sticky);
          height: var(--header-height);
          background: var(--color-surface);
          border-bottom: 1px solid transparent;
          transition: all var(--transition-base);
          backdrop-filter: blur(12px);
        }

        .header--scrolled {
          border-bottom-color: var(--color-border);
          box-shadow: var(--shadow-sm);
        }

        .header__inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 100%;
          gap: var(--space-6);
        }

        .header__logo {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-size-xl);
          font-weight: 800;
          color: var(--color-text);
          text-decoration: none;
          transition: opacity var(--transition-fast);
          flex-shrink: 0;
        }

        .header__logo:hover {
          opacity: 0.8;
          color: var(--color-text);
        }

        .header__logo-icon {
          font-size: 1.5rem;
        }

        .header__logo-text {
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header__nav {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }

        .header__nav-link {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--color-text-secondary);
          border-radius: var(--radius-lg);
          transition: all var(--transition-fast);
          text-decoration: none;
        }

        .header__nav-link:hover {
          color: var(--color-text);
          background: var(--color-bg-alt);
        }

        .header__nav-link--active {
          color: var(--color-primary);
          background: var(--color-primary-bg);
        }

        .header__nav-icon {
          font-size: 1.1rem;
        }

        .header__actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .header__user {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .header__user-name {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--color-text);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .header__user-name {
            display: none;
          }
        }

        .header__theme-btn {
          font-size: 1.2rem;
        }

        /* Hamburger */
        .header__menu-btn {
          display: none;
        }

        .header__hamburger {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 20px;
        }

        .header__hamburger span {
          display: block;
          height: 2px;
          background: var(--color-text);
          border-radius: 2px;
          transition: all var(--transition-base);
          transform-origin: center;
        }

        .header__hamburger.is-open span:nth-child(1) {
          transform: translateY(7px) rotate(45deg);
        }

        .header__hamburger.is-open span:nth-child(2) {
          opacity: 0;
        }

        .header__hamburger.is-open span:nth-child(3) {
          transform: translateY(-7px) rotate(-45deg);
        }

        /* Mobile Nav */
        .header__mobile-overlay {
          display: none;
        }

        .header__mobile-nav {
          display: none;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .header__nav {
            display: none;
          }

          .header__menu-btn {
            display: inline-flex;
          }

          .header__mobile-overlay {
            display: block;
            position: fixed;
            inset: 0;
            top: var(--header-height);
            background: rgba(0, 0, 0, 0.4);
            z-index: -1;
            animation: fadeIn 200ms ease-out;
          }

          .header__mobile-nav {
            display: flex;
            flex-direction: column;
            position: fixed;
            top: var(--header-height);
            left: 0;
            right: 0;
            background: var(--color-surface);
            border-bottom: 1px solid var(--color-border);
            padding: var(--space-4);
            gap: var(--space-2);
            transform: translateY(-100%);
            opacity: 0;
            transition: all var(--transition-base);
            box-shadow: var(--shadow-lg);
          }

          .header__mobile-nav.is-open {
            transform: translateY(0);
            opacity: 1;
          }

          .header__mobile-link {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-3) var(--space-4);
            font-size: var(--font-size-base);
            font-weight: 500;
            color: var(--color-text-secondary);
            border-radius: var(--radius-lg);
            transition: all var(--transition-fast);
            text-decoration: none;
          }

          .header__mobile-link:hover {
            background: var(--color-bg-alt);
            color: var(--color-text);
          }

          .header__mobile-link--active {
            background: var(--color-primary-bg);
            color: var(--color-primary);
          }
        }
      `}</style>
    </header>
  );
}
