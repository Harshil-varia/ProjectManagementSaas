// app/api/user/project-permissions/route.ts

import { getServerSession } from 'next-auth/next'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@/app/generated/prisma'

const prisma = new PrismaClient()

// Types matching your schema
interface ProjectPermission {
  id: string
  name: string
  color: string
  canView: boolean
  canEdit: boolean
  permissions: string[] // Array of permission types user has
}

interface UserProjectPermissions {
  projects: ProjectPermission[]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // If user is admin, they don't need specific project permissions
    // as they have access to all project reports via admin navigation
    if (session.user.role === 'ADMIN') {
      return NextResponse.json({ projects: [] })
    }

    const userProjectPermissions = await fetchUserProjectPermissions(session.user.id)
    return NextResponse.json({ projects: userProjectPermissions })

  } catch (error) {
    console.error('Error fetching project permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

async function fetchUserProjectPermissions(userId: string): Promise<ProjectPermission[]> {
  try {
    // Fetch user's project permissions with project details
    const userPermissions = await prisma.projectPermission.findMany({
      where: {
        userId: userId,
        project: {
          active: true // Only include active projects
        }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            active: true
          }
        }
      },
      orderBy: {
        project: {
          name: 'asc'
        }
      }
    })

    // Group permissions by project
    const projectPermissionsMap = new Map<string, {
      project: any,
      permissions: string[]
    }>()

    userPermissions.forEach(permission => {
      const projectId = permission.project.id
      
      if (!projectPermissionsMap.has(projectId)) {
        projectPermissionsMap.set(projectId, {
          project: permission.project,
          permissions: []
        })
      }
      
      projectPermissionsMap.get(projectId)!.permissions.push(permission.permission)
    })

    // Convert to the expected format
    return Array.from(projectPermissionsMap.values()).map(({ project, permissions }) => {
      // Determine access levels based on permissions
      const canView = permissions.includes('VIEW_REPORTS') || 
                      permissions.includes('FULL_ACCESS')
      
      const canEdit = permissions.includes('EDIT_BUDGETS') || 
                      permissions.includes('FULL_ACCESS')

      return {
        id: project.id,
        name: project.name,
        color: project.color,
        canView,
        canEdit,
        permissions
      }
    }).filter(project => project.canView) // Only return projects user can at least view

  } catch (error) {
    console.error('Database error fetching project permissions:', error)
    throw error
  }
}

// Helper function to check specific permission (can be used elsewhere in your app)
export async function checkUserProjectPermission(
  userId: string, 
  projectId: string, 
  requiredPermission: 'VIEW_REPORTS' | 'EDIT_BUDGETS' | 'FULL_ACCESS'
): Promise<boolean> {
  try {
    const permission = await prisma.projectPermission.findFirst({
      where: {
        userId,
        projectId,
        OR: [
          { permission: requiredPermission },
          { permission: 'FULL_ACCESS' } // FULL_ACCESS grants all permissions
        ]
      }
    })

    return !!permission
  } catch (error) {
    console.error('Error checking user project permission:', error)
    return false
  } finally {
    await prisma.$disconnect()
  }
}