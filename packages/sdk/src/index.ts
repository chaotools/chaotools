/**
 * Chaotools SDK - 工具开发基础包
 *
 * 使用方式:
 * import { createTool } from '@chaotools/sdk';
 */

import type { Tool, CreateToolDto, TechInfo, Pricing } from '@chaotools/types';

// ============ 工具实例类型 ============

export interface ToolInstance {
  id: string;
  name: string;
  version: string;
  manifest: ToolManifest;
}

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  entry: string;
  author?: string;
  repository?: string;
}

// ============ App API (工具调用) ============

export interface ToolApp {
  // 获取元素
  get: (selector: string) => HTMLElement | null;
  getAll: (selector: string) => HTMLElement[];

  // 设置/获取内容
  set: (selector: string, content: string) => void;
  getValue: (selector: string) => string;
  setValue: (selector: string, value: string) => void;

  // 事件绑定 (简化版)
  on: (selector: string, event: string, handler: EventHandler) => void;
  off: (selector: string, event: string, handler: EventHandler) => void;

  // 工具信息
  getManifest: () => ToolManifest;

  // 生命周期
  onMount: (callback: () => void) => void;
  onDestroy: (callback: () => void) => void;

  // 存储 (可选)
  storage: StorageAPI;

  // 工具间通信
  emit: (event: string, data: unknown) => void;
  onEvent: (event: string, handler: (data: unknown) => void) => void;
}

export type EventHandler = (event: Event | CustomEvent) => void;

export interface StorageAPI {
  get: <T>(key: string) => T | null;
  set: <T>(key: string, value: T) => void;
  remove: (key: string) => void;
  clear: () => void;
}

// ============ 工具配置 ============

export interface ToolConfig {
  id: string;
  name: string;
  description?: string;
  version?: string;
  entry?: string;

  // 渲染方式
  render?: string | RenderFunction;

  // 生命周期
  onMount?: () => void;
  onDestroy?: () => void;

  // 存储
  storage?: boolean;
}

export type RenderFunction = (app: ToolApp) => void;

// ============ 核心函数 ============

const manifest: ToolManifest = {
  id: '',
  name: '',
  description: '',
  version: '0.1.0',
  entry: '',
};

let mountedCallback: (() => void) | null = null;
let destroyCallback: (() => void) | null = null;
const eventHandlers = new Map<string, Set<(data: unknown) => void>>();

function createApp(): ToolApp {
  const storagePrefix = `chaotools_${manifest.id}_`;

  return {
    get: (selector) => document.querySelector(selector),

    getAll: (selector) => Array.from(document.querySelectorAll(selector)),

    set: (selector, content) => {
      const el = document.querySelector(selector);
      if (el) el.innerHTML = content;
    },

    getValue: (selector) => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      return el?.value ?? '';
    },

    setValue: (selector, value) => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
      if (el) el.value = value;
    },

    on: (selector, event, handler) => {
      const el = document.querySelector(selector);
      if (el) el.addEventListener(event, handler);
    },

    off: (selector, event, handler) => {
      const el = document.querySelector(selector);
      if (el) el.removeEventListener(event, handler);
    },

    getManifest: () => ({ ...manifest }),

    onMount: (callback) => {
      mountedCallback = callback;
    },

    onDestroy: (callback) => {
      destroyCallback = callback;
    },

    storage: {
      get: <T>(key: string): T | null => {
        try {
          const item = localStorage.getItem(storagePrefix + key);
          return item ? JSON.parse(item) : null;
        } catch {
          return null;
        }
      },

      set: <T>(key: string, value: T) => {
        try {
          localStorage.setItem(storagePrefix + key, JSON.stringify(value));
        } catch {
          console.warn('Storage quota exceeded');
        }
      },

      remove: (key: string) => {
        localStorage.removeItem(storagePrefix + key);
      },

      clear: () => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(storagePrefix));
        keys.forEach(k => localStorage.removeItem(k));
      },
    },

    emit: (event, data) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(data));
      }
    },

    onEvent: (event, handler) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
    },
  };
}

/**
 * 创建工具实例
 */
export function createTool(config: ToolConfig): void {
  manifest.id = config.id;
  manifest.name = config.name;
  manifest.description = config.description || '';
  manifest.version = config.version || '0.1.0';
  manifest.entry = config.entry || '';

  if (typeof config.render === 'string') {
    // 字符串模板方式
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector('#root');
      if (root) {
        root.innerHTML = config.render as string;
        const app = createApp();
        if (config.onMount) {
          config.onMount();
          mountedCallback?.();
        }
      }
    });
  } else if (typeof config.render === 'function') {
    // 函数方式
    document.addEventListener('DOMContentLoaded', () => {
      const app = createApp();
      config.render!(app);
      mountedCallback?.();
    });
  }
}

/**
 * 获取工具清单
 */
export function getManifest(): ToolManifest {
  return { ...manifest };
}

// ============ 导出类型 ============

export type { ToolConfig, ToolApp, ToolManifest, StorageAPI, RenderFunction };
