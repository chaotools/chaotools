/**
 * Chaotools 核心类型定义
 * 统一类型系统 — Hub SPA 和 Gateway API 共用
 */

// ============ 基础枚举 ============

export type ToolVisibility = 'private' | 'team' | 'public';
export type ToolStatus = 'draft' | 'review' | 'published' | 'deprecated';
export type OwnerType = 'owner' | 'community';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type PricingType = 'free' | 'freemium' | 'paid';
export type ContributorRole = 'author' | 'contributor';
export type ThemeMode = 'light' | 'dark' | 'system';
export type SortOrder = 'name' | 'category' | 'recent';

// ============ 归属 ============

export interface Owner {
  id: string;
  name: string;
  type: OwnerType;
}

// ============ 审核 ============

export interface Review {
  reviewer: string;
  status: ReviewStatus;
  feedback?: string;
  reviewedAt: Date;
}

// ============ 技术信息 ============

export interface TechInfo {
  entry: string;          // 入口 URL 或路径
  version?: string;       // 当前版本（静态 manifest 可选）
  repository?: string;    // 代码仓库
  newWindow?: boolean;    // 是否新窗口打开
}

// ============ 定价 ============

export interface Pricing {
  type: PricingType;
  price?: number;         // 分
}

// ============ 贡献者 ============

export interface Contributor {
  id: string;
  name: string;
  role: ContributorRole;
}

// ============ 分类 ============

export interface Category {
  id: string;
  name: string;
  icon: string;           // emoji 或 icon name
  description?: string;
  order?: number;
}

// ============ 工具（统一类型） ============

export interface Tool {
  // 基础信息
  id: string;                 // 唯一 ID: "json-formatter"
  name: string;               // 显示名称: "JSON 格式化"
  slug: string;               // URL 别名: "json-formatter"
  description: string;        // 简短描述
  longDescription?: string;   // 详细描述

  // 显示
  icon: string;               // emoji 或 PNG 路径
  thumbnail?: string;         // 品牌 SVG 或备用图片

  // 归属（静态 manifest 可选，Gateway API 必填）
  owner?: Owner;

  // 访问控制（可选，默认 public）
  visibility?: ToolVisibility;

  // 状态（可选，默认 published）
  status?: ToolStatus;

  // 分类
  categories: string[];       // category id 数组

  // 标签
  tags: string[];

  // 审核（社区工具需要）
  review?: Review;

  // 技术信息
  tech: TechInfo;

  // 定价（可选，默认 free）
  pricing?: Pricing;

  // 贡献者（社区工具）
  contributors?: Contributor[];

  // 时间戳（可选，Gateway API 必填）
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date;

  // 素材
  screenshots?: string[];
  documentation?: string;
}

// ============ 清单 ============

export interface Manifest {
  name: string;
  version: string;
  description: string;
  tools: Tool[];
  categories: Category[];
}

// ============ 工具注册表 ============

export interface ToolRegistry {
  version: string;
  updatedAt: Date;
  tools: Tool[];
}

// ============ 收藏 ============

export interface SavedTool {
  toolId: string;
  savedAt: number;
}

// ============ 用户/角色 ============

export type UserRole = 'owner' | 'member' | 'contributor' | 'public';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

// ============ API 响应 ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============ 权限矩阵 ============

export interface PermissionMatrix {
  canView: boolean;
  canUse: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canReview: boolean;
}

/**
 * 检查用户对工具的权限
 */
export function checkToolPermission(
  tool: Tool,
  userRole: UserRole,
  isOwner: boolean = false
): PermissionMatrix {
  const isOwnerUser = isOwner || userRole === 'owner';

  switch (userRole) {
    case 'owner':
      return {
        canView: true,
        canUse: true,
        canEdit: true,
        canDelete: true,
        canPublish: true,
        canReview: true,
      };

    case 'member':
      return {
        canView: (tool.visibility || 'public') !== 'private',
        canUse: (tool.visibility || 'public') !== 'private',
        canEdit: false,
        canDelete: false,
        canPublish: false,
        canReview: false,
      };

    case 'contributor':
      return {
        canView: (tool.visibility || 'public') === 'public',
        canUse: (tool.visibility || 'public') === 'public',
        canEdit: false,
        canDelete: false,
        canPublish: false,
        canReview: false,
      };

    case 'public':
    default:
      return {
        canView: (tool.visibility || 'public') === 'public',
        canUse: (tool.visibility || 'public') === 'public',
        canEdit: false,
        canDelete: false,
        canPublish: false,
        canReview: false,
      };
  }
}

// ============ 工具创建/更新 DTO ============

export interface CreateToolDto {
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  visibility: ToolVisibility;
  categories: string[];
  tags: string[];
  tech: TechInfo;
  pricing?: Pricing;
}

export interface UpdateToolDto extends Partial<CreateToolDto> {
  status?: ToolStatus;
  review?: Review;
}
