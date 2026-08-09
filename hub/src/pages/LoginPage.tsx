import { useState, useCallback, type FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError('');
      setSubmitting(true);
      try {
        await login(email.trim(), password);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== '/login' ? from : '/my-tools');
      } catch (err) {
        setError(err instanceof Error ? err.message : '登录失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, login, navigate, location.state]
  );

  return (
    <div className="auth-page">
      <div className="container section">
        <div className="card p-8 narrow-card animate-fade-in-up">
          <div className="auth-page__icon">🔐</div>
          <h1 className="auth-page__title">登录 Chaotools</h1>
          <p className="text-muted auth-page__subtitle">
            登录后收藏可跨设备同步
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-form__label">
              邮箱
              <input
                type="email"
                className="auth-form__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>

            <label className="auth-form__label">
              密码
              <input
                type="password"
                className="auth-form__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                autoComplete="current-password"
              />
            </label>

            {error && <p className="auth-form__error">⚠️ {error}</p>}

            <button
              type="submit"
              className="btn btn-primary btn-lg auth-form__submit"
              disabled={submitting}
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <p className="auth-page__switch">
            还没有账号？<Link to="/register">立即注册</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
