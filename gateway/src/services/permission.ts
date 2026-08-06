/**
 * 权限服务 - 三层权限模型
 *
 * Private (私有)  | 只有 owner 自己
 * Team (团队)    | owner + 团队成员
 * Public (社区)  | 所有人
 */

import type { Tool, UserRole, PermissionMatrix } from '@chaotools/types';

// 权限矩阵
export interface RolePermissions {
  // 查看权限
  canViewPrivate: boolean;   // 能否查看私有工具
  canViewTeam: boolean;       // 能否查看团队工具
  canViewPublic: boolean;     // 能否查看公开工具

  // 使用权限
  canUsePrivate: boolean;     // 能否使用私有工具
  canUseTeam: boolean;       // 能否使用团队工具
  canUsePublic: boolean;     // 能否使用公开工具

  // 编辑权限
  canEditOwn: boolean;       // 能否编辑自己的工具
  canEditAny: boolean;       // 能否编辑任何工具

  // 删除权限
  canDeleteOwn: boolean;     // 能否删除自己的工具
  canDeleteAny: boolean;    // 能否删除任何工具

  // 发布权限
  canPublish: boolean;       // 能否直接发布工具
  canSubmitReview: boolean;  // 能否提交审核

  // 审核权限
  canReview: boolean;        // 能否审核工具

  // 管理权限
  canManageUsers: boolean;    // 能否管理用户
  canManageAllTools: boolean; // 能否管理所有工具
}

// 角色权限配置
const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  owner: {
    // 视图权限
    canViewPrivate: true,
    canViewTeam: true,
    canViewPublic: true,

    // 使用权限
    canUsePrivate: true,
    canUseTeam: true,
    canUsePublic: true,

    // 编辑权限
    canEditOwn: true,
    canEditAny: true,

    // 删除权限
    canDeleteOwn: true,
    canDeleteAny: true,

    // 发布权限
    canPublish: true,
    canSubmitReview: true,

    // 审核权限
    canReview: true,

    // 管理权限
    canManageUsers: true,
    canManageAllTools: true,
  },

  member: {
    // 视图权限
    canViewPrivate: false,
    canViewTeam: true,
    canViewPublic: true,

    // 使用权限
    canUsePrivate: false,
    canUseTeam: true,
    canUsePublic: true,

    // 编辑权限
    canEditOwn: false,
    canEditAny: false,

    // 删除权限
    canDeleteOwn: false,
    canDeleteAny: false,

    // 发布权限
    canPublish: false,
    canSubmitReview: false,

    // 审核权限
    canReview: false,

    // 管理权限
    canManageUsers: false,
    canManageAllTools: false,
  },

  contributor: {
    // 视图权限
    canViewPrivate: false,
    canViewTeam: false,
    canViewPublic: true,

    // 使用权限
    canUsePrivate: false,
    canUseTeam: false,
    canUsePublic: true,

    // 编辑权限
    canEditOwn: false,
    canEditAny: false,

    // 删除权限
    canDeleteOwn: false,
    canDeleteAny: false,

    // 发布权限
    canPublish: false,
    canSubmitReview: true,  // 可以提交审核

    // 审核权限
    canReview: false,

    // 管理权限
    canManageUsers: false,
    canManageAllTools: false,
  },

  public: {
    // 视图权限
    canViewPrivate: false,
    canViewTeam: false,
    canViewPublic: true,

    // 使用权限
    canUsePrivate: false,
    canUseTeam: false,
    canUsePublic: true,

    // 编辑权限
    canEditOwn: false,
    canEditAny: false,

    // 删除权限
    canDeleteOwn: false,
    canDeleteAny: false,

    // 发布权限
    canPublish: false,
    canSubmitReview: false,

    // 审核权限
    canReview: false,

    // 管理权限
    canManageUsers: false,
    canManageAllTools: false,
  },
};

/**
 * 获取用户角色权限
 */
export function getRolePermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.public;
}

/**
 * 检查用户能否查看工具
 */
export function canViewTool(
  tool: Tool,
  userRole: UserRole,
  userId: string
): boolean {
  const perms = getRolePermissions(userRole);

  // owner 可以看所有
  if (userRole === 'owner') {
    return true;
  }

  const isToolOwner = tool.owner.id === userId;

  switch (tool.visibility) {
    case 'private':
      return perms.canViewPrivate && isToolOwner;
    case 'team':
      // 团队归属尚未实现（tools 表无 team_id），暂时仅 owner 可见
      return perms.canViewTeam && isToolOwner;
    case 'public':
      return perms.canViewPublic;
    default:
      return false;
  }
}

/**
 * 检查用户能否使用工具
 */
export function canUseTool(
  tool: Tool,
  userRole: UserRole,
  userId: string
): boolean {
  const perms = getRolePermissions(userRole);

  if (userRole === 'owner') {
    return true;
  }

  const isToolOwner = tool.owner.id === userId;

  switch (tool.visibility) {
    case 'private':
      return perms.canUsePrivate && isToolOwner;
    case 'team':
      return perms.canUseTeam && isToolOwner;
    case 'public':
      return perms.canUsePublic;
    default:
      return false;
  }
}

/**
 * 检查用户能否编辑工具
 */
export function canEditTool(
  tool: Tool,
  userRole: UserRole,
  userId: string
): boolean {
  const perms = getRolePermissions(userRole);
  const isToolOwner = tool.owner.id === userId;

  if (perms.canEditAny) {
    return true;
  }

  if (perms.canEditOwn && isToolOwner) {
    return true;
  }

  return false;
}

/**
 * 检查用户能否删除工具
 */
export function canDeleteTool(
  tool: Tool,
  userRole: UserRole,
  userId: string
): boolean {
  const perms = getRolePermissions(userRole);
  const isToolOwner = tool.owner.id === userId;

  if (perms.canDeleteAny) {
    return true;
  }

  if (perms.canDeleteOwn && isToolOwner) {
    return true;
  }

  return false;
}

/**
 * 检查用户能否发布工具 (直接发布，不需要审核)
 */
export function canPublishTool(
  userRole: UserRole
): boolean {
  return getRolePermissions(userRole).canPublish;
}

/**
 * 检查用户能否提交审核
 */
export function canSubmitForReview(
  userRole: UserRole
): boolean {
  return getRolePermissions(userRole).canSubmitReview;
}

/**
 * 检查用户能否审核工具
 */
export function canReviewTool(
  userRole: UserRole
): boolean {
  return getRolePermissions(userRole).canReview;
}

/**
 * 获取用户对工具的完整权限
 */
export function getToolPermissions(
  tool: Tool,
  userRole: UserRole,
  userId: string
): PermissionMatrix {
  return {
    canView: canViewTool(tool, userRole, userId),
    canUse: canUseTool(tool, userRole, userId),
    canEdit: canEditTool(tool, userRole, userId),
    canDelete: canDeleteTool(tool, userRole, userId),
    canPublish: canPublishTool(userRole),
    canReview: canReviewTool(userRole),
  };
}

/**
 * 根据 visibility 过滤工具列表
 */
export function filterToolsByVisibility(
  tools: Tool[],
  userRole: UserRole,
  userId: string
): Tool[] {
  const perms = getRolePermissions(userRole);
  const isOwnerUser = userRole === 'owner';

  return tools.filter(tool => {
    // owner 可以看所有
    if (isOwnerUser) {
      return true;
    }

    switch (tool.visibility) {
      case 'private':
        return perms.canViewPrivate && tool.owner.id === userId;
      case 'team':
        return perms.canViewTeam && tool.owner.id === userId;
      case 'public':
        return perms.canViewPublic;
      default:
        return false;
    }
  });
}
