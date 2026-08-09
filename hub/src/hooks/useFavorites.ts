import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

const LOCAL_KEY = 'chaotools-saved';

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((s) => (typeof s === 'string' ? s : s?.toolId)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeLocal(toolIds: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(toolIds.map((toolId) => ({ toolId, savedAt: Date.now() }))));
  } catch {
    // ignore quota errors
  }
}

interface UseFavoritesReturn {
  savedIds: string[];
  isSaved: (toolId: string) => boolean;
  toggleSave: (toolId: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export function useFavorites(): UseFavoritesReturn {
  const { user } = useAuth();
  const [serverIds, setServerIds] = useState<string[] | null>(null);
  const [localIds, setLocalIds] = useState<string[]>(readLocal);
  const syncingRef = useRef(false);

  const isLoggedIn = !!user;

  // 登录时：拉取服务端收藏 + 合并本地收藏（并集）→ 推回服务端。
  // 只有推送成功后才清空本地，失败时本地收藏保留、界面回退到本地数据，避免数据丢失
  useEffect(() => {
    if (!isLoggedIn) {
      setServerIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { toolIds } = await api.getFavorites();
        if (cancelled) return;
        const merged = [...new Set([...readLocal(), ...toolIds])].slice(0, 500);
        setServerIds(merged);
        if (merged.length > 0) {
          await api.replaceFavorites(merged);
        }
        if (!cancelled) {
          setLocalIds([]);
          writeLocal([]);
        }
      } catch {
        // 拉取/推送失败：保留本地收藏，不置空
        if (!cancelled) setServerIds(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.id]);

  const savedIds = useRef<string[]>([]);
  savedIds.current = isLoggedIn ? (serverIds ?? localIds) : localIds;

  const isSaved = useCallback(
    (toolId: string) => savedIds.current.includes(toolId),
    []
  );

  const toggleSave = useCallback(
    async (toolId: string) => {
      const current = savedIds.current;
      const next = current.includes(toolId)
        ? current.filter((id) => id !== toolId)
        : [...current, toolId];

      if (isLoggedIn) {
        if (syncingRef.current) return;
        syncingRef.current = true;
        setServerIds(next);
        try {
          if (next.includes(toolId)) {
            await api.addFavorite(toolId);
          } else {
            await api.removeFavorite(toolId);
          }
        } catch {
          // 失败回滚，下次拉取恢复
          setServerIds(current);
        } finally {
          syncingRef.current = false;
        }
      } else {
        writeLocal(next);
        setLocalIds(next);
      }
    },
    [isLoggedIn]
  );

  const clearAll = useCallback(async () => {
    if (isLoggedIn) {
      setServerIds([]);
      try {
        await api.replaceFavorites([]);
      } catch {
        // ignore
      }
    } else {
      writeLocal([]);
      setLocalIds([]);
    }
  }, [isLoggedIn]);

  return { savedIds: savedIds.current, isSaved, toggleSave, clearAll };
}
