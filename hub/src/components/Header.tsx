import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: '首页' },
  { path: '/explore', label: '探索' },
  { path: '/my-tools', label: '我的工具' },
] as const;

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  useEffect(() => setMobileMenuOpen(false), [location.pathname]);
  useEffect(() => {
    const closeOnResize = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); };
    window.addEventListener('resize', closeOnResize);
    return () => window.removeEventListener('resize', closeOnResize);
  }, []);

  const handleLogout = useCallback(() => { void logout(); navigate('/'); }, [logout, navigate]);

  return (
    <header className="header" role="banner">
      <div className="container header__inner">
        <Link to="/" className="header__logo" aria-label="Chaotools 首页">
          <img src="/ct-icon.png" alt="CT" className="header__logo-img" width={30} height={30} />
          <span className="header__logo-text">Chaotools</span>
        </Link>
        <nav className="header__nav" role="navigation" aria-label="主导航">
          {NAV_ITEMS.map((item) => <Link key={item.path} to={item.path} className={`header__nav-link ${location.pathname === item.path ? 'header__nav-link--active' : ''}`}>{item.label}</Link>)}
        </nav>
        <div className="header__actions">
          <Link to="/explore?focus=1" className="header__search-link">搜索工具</Link>
          {user ? <div className="header__user"><span className="header__user-name" title={user.email}>{user.name}</span><button className="btn btn-ghost btn-sm" onClick={handleLogout}>退出</button></div> : <Link to="/login" className="btn btn-primary btn-sm header__login-btn">登录</Link>}
          <button className="btn btn-icon btn-ghost header__theme-btn" onClick={toggleTheme} aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}>{isDark ? '☀' : '◐'}</button>
          <button className="btn btn-icon btn-ghost header__menu-btn" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={mobileMenuOpen}><span className="header__hamburger"><span /><span /><span /></span></button>
        </div>
      </div>
      {mobileMenuOpen && <div className="header__mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <nav className={`header__mobile-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="移动端导航">
        {NAV_ITEMS.map((item) => <Link key={item.path} to={item.path} className={`header__mobile-link ${location.pathname === item.path ? 'header__mobile-link--active' : ''}`}>{item.label}</Link>)}
        <Link to="/explore?focus=1" className="header__mobile-link">搜索工具</Link>
      </nav>
    </header>
  );
}
