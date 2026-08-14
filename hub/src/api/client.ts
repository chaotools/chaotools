/**
 * Gateway API 客户端（同源 /gateway/ 路径）
 *
 * 安全模型：
 * - 访问令牌（短时效，15 分钟）仅保存在内存中，不再写入 localStorage，降低 XSS 窃取面
 * - 刷新令牌存于 httpOnly Cookie，脚本无法读取；401 时静默刷新并重试
 * - 页面刷新后凭刷新 Cookie 自动恢复登录态
 */

const BASE = '/gateway';

let accessToken: string | null = null;
let refreshInFlight: Promise<'ok' | 'rejected' | 'network'> | null = null;

// 页面加载时迁移历史 localStorage token（旧版本遗留）。
// 只读入内存并立即移除，避免继续以明文形式暴露在 localStorage 中。
function migrateLegacyToken(): void {
  try {
    const legacy = localStorage.getItem('chaotools-token');
    if (legacy) {
      accessToken = legacy;
      localStorage.removeItem('chaotools-token');
    }
  } catch {
    // ignore
  }
}
migrateLegacyToken();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function logoutLocal(): void {
  accessToken = null;
  localStorage.removeItem('chaotools-user');
  window.dispatchEvent(new CustomEvent('chaotools:logout'));
}

async function tryRefresh(): Promise<'ok' | 'rejected' | 'network'> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = (await response.json()) as ApiResponse<{ user: AuthUser; token: string }>;
      if (response.ok && body.success && body.data?.token) {
        accessToken = body.data.token;
        return 'ok' as const;
      }
      return 'rejected' as const;
    } catch {
      return 'network' as const;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
  allowRetry = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  let body: ApiResponse<T>;
  try {
    body = await response.json();
  } catch {
    throw new Error(`请求失败 (${response.status})`);
  }

  if (!response.ok || !body.success) {
    // 访问令牌过期：尝试静默刷新一次后重试（登录/刷新本身除外）
    if (response.status === 401 && allowRetry && path !== '/auth/login' && path !== '/auth/refresh') {
      const refreshed = await tryRefresh();
      if (refreshed === 'ok') {
        return request<T>(path, options, false);
      }
      // 刷新确认被拒（Cookie 失效/被撤销）→ 清理本地登录态；
      // 网络异常（refreshed === 'network'）则保留登录态，避免临时断网被登出
      if (refreshed === 'rejected') {
        logoutLocal();
      }
    }
    const message = body.error?.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return body.data as T;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export interface Captcha {
  id: string;
  question: string;
}

export interface PopularTool {
  id: string;
  total: number;
  today: number;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register(name: string, email: string, password: string, captchaId: string, captchaAnswer: string) {
    return request<LoginResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, captchaId, captchaAnswer }),
    });
  },

  getCaptcha() {
    return request<{ id: string; question: string }>('/auth/captcha');
  },

  logout() {
    return request<null>('/auth/logout', {
      method: 'POST',
    });
  },

  getFavorites() {
    return request<{ toolIds: string[] }>('/users/me/favorites');
  },

  getProfile() {
    return request<{ displayName?: string; bio?: string }>('/users/me/profile');
  },

  replaceFavorites(toolIds: string[]) {
    return request<{ toolIds: string[] }>('/users/me/favorites', {
      method: 'PUT',
      body: JSON.stringify({ toolIds }),
    });
  },

  addFavorite(toolId: string) {
    return request<{ toolIds: string[] }>(`/users/me/favorites/${toolId}`, {
      method: 'POST',
    });
  },

  removeFavorite(toolId: string) {
    return request<{ toolIds: string[] }>(`/users/me/favorites/${toolId}`, {
      method: 'DELETE',
    });
  },

  // 留言板热门工具统计（独立服务，非 gateway）
  async getPopularTools(n = 6): Promise<PopularTool[]> {
    const response = await fetch(`/api/message-board/stats/popular?n=${n}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const body = (await response.json()) as ApiResponse<PopularTool[]>;
    if (!response.ok || !body.success) {
      throw new Error(body.error?.message || '获取热门工具失败');
    }
    return body.data as PopularTool[];
  },
};