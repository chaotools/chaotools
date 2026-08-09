import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type Captcha } from '@/api/client';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptcha(await api.getCaptcha());
      setCaptchaAnswer('');
    } catch {
      setCaptcha(null);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError('');

      if (password !== confirm) {
        setError('两次输入的密码不一致');
        return;
      }
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setError('密码至少 8 位，且必须同时包含字母和数字');
        return;
      }
      if (name.trim().length < 2) {
        setError('昵称至少 2 个字符');
        return;
      }
      if (!captcha || !captchaAnswer.trim()) {
        setError('请完成验证码');
        return;
      }
      if (!/^\d+$/.test(captchaAnswer.trim())) {
        setError('验证码请输入数字答案');
        return;
      }

      setSubmitting(true);
      try {
        await register(name.trim(), email.trim(), password, captcha.id, captchaAnswer.trim());
        navigate('/my-tools');
      } catch (err) {
        setError(err instanceof Error ? err.message : '注册失败，请重试');
        loadCaptcha();
      } finally {
        setSubmitting(false);
      }
    },
    [name, email, password, confirm, captcha, captchaAnswer, register, navigate, submitting, loadCaptcha]
  );

  return (
    <div className="auth-page">
      <div className="container section">
        <div className="card p-8 narrow-card animate-fade-in-up">
          <div className="auth-page__icon">📝</div>
          <h1 className="auth-page__title">注册账号</h1>
          <p className="text-muted auth-page__subtitle">
            创建账号后即可跨设备同步收藏
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-form__label">
              昵称
              <input
                type="text"
                className="auth-form__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的昵称"
                required
                minLength={2}
                maxLength={30}
                autoComplete="nickname"
              />
            </label>

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
                placeholder="至少 8 位，需含字母和数字"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <label className="auth-form__label">
              确认密码
              <input
                type="password"
                className="auth-form__input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入密码"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <label className="auth-form__label">
              验证码
              <div className="auth-form__captcha">
                <input
                  className="auth-form__input"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder={captcha ? captcha.question : '加载中...'}
                  required
                  inputMode="numeric"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-secondary auth-form__captcha-refresh"
                  onClick={loadCaptcha}
                  disabled={!captcha}
                >
                  换一题
                </button>
              </div>
            </label>

            {error && <p className="auth-form__error">⚠️ {error}</p>}

            <button
              type="submit"
              className="btn btn-primary btn-lg auth-form__submit"
              disabled={submitting}
            >
              {submitting ? '注册中...' : '注册'}
            </button>
          </form>

          <p className="auth-page__switch">
            已有账号？<Link to="/login">直接登录</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
