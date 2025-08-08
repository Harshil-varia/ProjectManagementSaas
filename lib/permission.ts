// lib/permissions.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NEXT_AUTH_CONFIG } from "./auth";

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message
    return String(error)
  }
export type PermissionType = 'VIEW_REPORTS' | 'EDIT_BUDGETS' | 'FULL_ACCESS'

export interface UserPermissions {
  isAdmin: boolean
  projectPermissions: Map<string, PermissionType[]>
}

export class PermissionManager {
  public static async getUserPermissions(userId: string): Promise<UserPermissions> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided')
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          projectPermissions: {
            include: {
              project: {
                select: { id: true, name: true }
              }
            }
          }
        }
      })

      if (!user) {
        throw new Error('User not found')
      }



      const projectPermissions = new Map<string, PermissionType[]>()
      
      if (user.projectPermissions) {
        user.projectPermissions.forEach(permission => {
          const projectId = permission.projectId
          if (projectId) {
            if (!projectPermissions.has(projectId)) {
              projectPermissions.set(projectId, [])
            }
            const permType = permission.permission as PermissionType
            if (permType) {
              projectPermissions.get(projectId)!.push(permType)
            }
          }
        })
      }

      return {
        isAdmin: user.role === 'ADMIN',
        projectPermissions
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error)
      throw new Error('Failed to fetch user permissions')
    }
  }

  public static async canAccessProject(
    userId: string,
    projectId: string,
    requiredPermission?: PermissionType
  ): Promise<boolean> {
    if (!userId || !projectId) {
      return false
    }

    try {
      const permissions = await this.getUserPermissions(userId)
      
      // Admins have access to everything
      if (permissions.isAdmin) {
        return true
      }

      // Check if user is assigned to the project (basic access)
      const projectUser = await prisma.projectUser.findFirst({
        where: { userId, projectId }
      })

      if (!projectUser && !permissions.projectPermissions.has(projectId)) {
        return false
      }

      // If no specific permission required, basic project access is enough
      if (!requiredPermission) {
        return true
      }

      // Check specific permission
      const userProjectPermissions = permissions.projectPermissions.get(projectId) || []
      
      // FULL_ACCESS grants all permissions
      if (userProjectPermissions.includes('FULL_ACCESS')) {
        return true
      }

      return userProjectPermissions.includes(requiredPermission)
    } catch (error) {
      console.error('Error checking project access:', error)
      return false
    }
  }

  public static async canViewReports(userId: string, projectId: string): Promise<boolean> {
    return this.canAccessProject(userId, projectId, 'VIEW_REPORTS')
  }

  public static async canEditBudgets(userId: string, projectId: string): Promise<boolean> {
    return this.canAccessProject(userId, projectId, 'EDIT_BUDGETS')
  }

  public static async getAccessibleProjects(
    userId: string,
    permission?: PermissionType
  ): Promise<string[]> {
    if (!userId) {
      return []
    }

    try {
      const permissions = await this.getUserPermissions(userId)
      
      if (permissions.isAdmin) {
        // Admins can access all projects
        const allProjects = await prisma.project.findMany({
          where: { active: true },
          select: { id: true }
        })
        return allProjects.map(p => p.id).filter(Boolean)
      }

      // Get projects user is assigned to
      const projectUsers = await prisma.projectUser.findMany({
        where: { userId },
        select: { projectId: true }
      })
      
      const accessibleProjects = new Set(
        projectUsers.map(pu => pu.projectId).filter(Boolean)
      )

      // Add projects with specific permissions
      if (permission) {
        permissions.projectPermissions.forEach((perms, projectId) => {
          if (perms.includes(permission) || perms.includes('FULL_ACCESS')) {
            accessibleProjects.add(projectId)
          }
        })
      } else {
        // If no specific permission required, add all projects with any permission
        permissions.projectPermissions.forEach((perms, projectId) => {
          accessibleProjects.add(projectId)
        })
      }

      return Array.from(accessibleProjects)
    } catch (error) {
      console.error('Error getting accessible projects:', error)
      return []
    }
  }

  public static async grantPermission(
    userId: string,
    projectId: string,
    permission: PermissionType,
    grantedBy: string
  ): Promise<void> {
    if (!userId || !projectId || !permission || !grantedBy) {
      throw new Error('Missing required parameters for granting permission')
    }

    try {
      // Check if permission already exists
      const existing = await prisma.projectPermission.findFirst({
        where: { userId, projectId, permission }
      })

      if (existing) {
        throw new Error('Permission already exists')
      }

      await prisma.projectPermission.create({
        data: {
          userId,
          projectId,
          permission
        }
      })
    } catch (error) {
      console.error('Error granting permission:', error)
      throw error
    }
  }

  public static async revokePermission(
    userId: string,
    projectId: string,
    permission?: PermissionType
  ): Promise<void> {
    if (!userId || !projectId) {
      throw new Error('Missing required parameters for revoking permission')
    }

    try {
      if (permission) {
        // Revoke specific permission
        await prisma.projectPermission.deleteMany({
          where: { userId, projectId, permission }
        })
      } else {
        // Revoke all permissions for this project
        await prisma.projectPermission.deleteMany({
          where: { userId, projectId }
        })
      }
    } catch (error) {
      console.error('Error revoking permission:', error)
      throw error
    }
  }

  public static async getProjectPermissionSummary(projectId: string): Promise<{
    totalUsers: number
    usersWithViewReports: number
    usersWithEditBudgets: number
    usersWithFullAccess: number
  }> {
    if (!projectId) {
      return {
        totalUsers: 0,
        usersWithViewReports: 0,
        usersWithEditBudgets: 0,
        usersWithFullAccess: 0
      }
    }

    try {
      const permissions = await prisma.projectPermission.findMany({
        where: { projectId },
        include: { user: true }
      })

      const userIds = new Set(permissions.map(p => p.userId).filter(Boolean))
      
      const viewReports = permissions.filter(p => 
        p.permission === 'VIEW_REPORTS' || p.permission === 'FULL_ACCESS'
      ).length

      const editBudgets = permissions.filter(p => 
        p.permission === 'EDIT_BUDGETS' || p.permission === 'FULL_ACCESS'
      ).length

      const fullAccess = permissions.filter(p => 
        p.permission === 'FULL_ACCESS'
      ).length

      return {
        totalUsers: userIds.size,
        usersWithViewReports: viewReports,
        usersWithEditBudgets: editBudgets,
        usersWithFullAccess: fullAccess
      }
    } catch (error) {
      console.error('Error getting permission summary:', error)
      return {
        totalUsers: 0,
        usersWithViewReports: 0,
        usersWithEditBudgets: 0,
        usersWithFullAccess: 0
      }
    }
  }
}

// Middleware helper for API routes
export async function requirePermission(
  userId: string,
  projectId: string,
  permission: PermissionType
): Promise<boolean> {
  try {
    return await PermissionManager.canAccessProject(userId, projectId, permission)
  } catch (error) {
    console.error('Permission check failed:', error)
    return false
  }
}

// Helper for checking admin access
export async function requireAdmin(userId: string): Promise<boolean> {
  if (!userId) {
    return false
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    })
    return user?.role === 'ADMIN'
  } catch (error) {
    console.error('Admin check failed:', error)
    return false
  }
}

// Higher-order function for API route permission checking
export function withPermissions(
  requiredPermission: PermissionType,
  handler: (req: any, res: any, user: any, projectId: string) => Promise<void>
) {
  return async (req: any, res: any) => {
    try {
      // Get session
      const session = await getServerSession(req, res, NEXT_AUTH_CONFIG)
      
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Extract project ID from query params
      const projectId = req.query.projectId || req.query.id
      
      if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'Project ID is required' })
      }

      // Check permissions
      const hasPermission = await PermissionManager.canAccessProject(
        session.user.id,
        projectId,
        requiredPermission
      )

      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: requiredPermission,
          projectId 
        })
      }

      // Call the actual handler with validated user and project
      return await handler(req, res, session.user, projectId)
      
    } catch (error) {
      console.error('Permission middleware error:', error)
      return res.status(500).json({ 
        error: 'Internal server error',
        details: getErrorMessage(error)
      })
    }
  }
}

// Alternative withPermissions for admin-only routes
export function withAdminPermissions(
  handler: (req: any, res: any, user: any) => Promise<void>
) {
  return async (req: any, res: any) => {
    try {
      // Get session
      const session = await getServerSession(req, res, NEXT_AUTH_CONFIG)
      
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Check admin permissions
      const isAdmin = await requireAdmin(session.user.id)

      if (!isAdmin) {
        return res.status(403).json({ 
          error: 'Admin access required'
        })
      }

      // Call the actual handler with validated admin user
      return await handler(req, res, session.user)
      
    } catch (error) {
      console.error('Admin permission middleware error:', error)
      return res.status(500).json({ 
        error: 'Internal server error',
        details: getErrorMessage(error)
      })
    }
  }
}

// Utility function for checking permissions in API routes without HOF
export async function checkPermissions(
  req: any,
  res: any,
  requiredPermission: PermissionType,
  projectId?: string
): Promise<{ authorized: boolean; user?: any; projectId?: string }> {
  try {
    const session = await getServerSession(req, res, NEXT_AUTH_CONFIG)
    
    if (!session || !session.user) {
      return { authorized: false }
    }

    const targetProjectId = projectId || req.query.projectId || req.query.id
    
    if (!targetProjectId || typeof targetProjectId !== 'string') {
      return { authorized: false }
    }

    const hasPermission = await PermissionManager.canAccessProject(
      session.user.id,
      targetProjectId,
      requiredPermission
    )

    return { 
      authorized: hasPermission, 
      user: session.user, 
      projectId: targetProjectId 
    }
    
  } catch (error) {
    console.error('Permission check error:', error)
    return { authorized: false }
  }
}
