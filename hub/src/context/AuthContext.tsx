import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken, getAccessToken, type AuthUser } from '@/api/client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string, captchaId: string, captchaAnswer: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('chaotools-user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [loading, setLoading] = useState(false);

  const applyAuth = useCallback((result: { user: AuthUser; token: string }) => {
    // 访问令牌仅存内存；刷新令牌由服务端写入 httpOnly Cookie
    setAccessToken(result.token);
    localStorage.setItem('chaotools-user', JSON.stringify(result.user));
    setUser(result.user);
    window.dispatchEvent(new CustomEvent('chaotools:login', { detail: result.user }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const result = await api.login(email, password);
        applyAuth(result);
        return result.user;
      } finally {
        setLoading(false);
      }
    },
    [applyAuth]
  );

  // 启动时恢复登录态：若有内存访问令牌或本地用户快照，凭 httpOnly 刷新 Cookie 静默恢复。
  // 底层 request() 在 401 时会走 /auth/refresh 自动恢复；刷新失败（Cookie 失效/被撤销）
  // 才清理本地登录态并广播 logout；网络异常（非 401）则保留登录态，避免临时断网被登出
  useEffect(() => {
    if (!getAccessToken() && !localStorage.getItem('chaotools-user')) return;
    let cancelled = false;
    setLoading(true);
    api
      .getProfile()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, captchaId: string, captchaAnswer: string) => {
      setLoading(true);
      try {
        const result = await api.register(name, email, password, captchaId, captchaAnswer);
        applyAuth(result);
        return result.user;
      } finally {
        setLoading(false);
      }
    },
    [applyAuth]
  );

  const logout = useCallback(async () => {
    try {
      // 服务端撤销刷新令牌并清除 httpOnly Cookie
      await api.logout();
    } catch {
      // 网络异常也继续本地登出，避免卡在登录态
    }
    setAccessToken(null);
    localStorage.removeItem('chaotools-user');
    setUser(null);
    window.dispatchEvent(new CustomEvent('chaotools:logout'));
  }, []);

  // 其他页面 token 失效时同步登出
  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener('chaotools:logout', handleLogout);
    return () => window.removeEventListener('chaotools:logout', handleLogout);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
