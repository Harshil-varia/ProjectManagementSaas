import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const permissionSchema = z.object({
  userId: z.string(),
  projectId: z.string(),
  permissions: z.array(z.enum(['VIEW_REPORTS', 'EDIT_BUDGETS', 'FULL_ACCESS']))
})

export async function GET() {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await prisma.projectPermission.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    })

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    })

    const projects = await prisma.project.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        color: true
      }
    })

    return NextResponse.json({ permissions, users, projects })
  } catch (error) {
    console.error('Failed to fetch permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, projectId, permissions } = permissionSchema.parse(body)

    // Remove existing permissions for this user-project combination
    await prisma.projectPermission.deleteMany({
      where: {
        userId,
        projectId
      }
    })

    // Add new permissions
    if (permissions.length > 0) {
      await prisma.projectPermission.createMany({
        data: permissions.map(permission => ({
          userId,
          projectId,
          permission
        }))
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update permissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const permissionId = searchParams.get('id')

    if (!permissionId) {
      return NextResponse.json({ error: 'Permission ID required' }, { status: 400 })
    }

    await prisma.projectPermission.delete({
      where: { id: permissionId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete permission:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
