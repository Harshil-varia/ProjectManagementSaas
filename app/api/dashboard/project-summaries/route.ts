// app/api/dashboard/project-summaries/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get projects with time entries and calculate summaries
    const projects = await prisma.project.findMany({
      where: { active: true },
      include: {
        timeEntries: {
          include: {
            user: {
              select: {
                employeeRate: true
              }
            }
          }
        },
        projectPermissions: session.user.role !== 'ADMIN' ? {
          where: {
            userId: session.user.id,
            permission: { in: ['VIEW_REPORTS', 'EDIT_BUDGETS', 'FULL_ACCESS'] }
          }
        } : undefined
      }
    })

    const projectSummaries = projects.map(project => {
      // Calculate totals
      const totalHours = project.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0)
      const totalSpent = project.timeEntries.reduce((sum, entry) => 
        sum + (Number(entry.hours) * Number(entry.user.employeeRate)), 0
      )
      const totalBudget = Number(project.totalBudget)
      const utilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

      // Check permissions
      let canViewReports = false
      if (session.user.role === 'ADMIN') {
        canViewReports = true
      } else if (project.projectPermissions && project.projectPermissions.length > 0) {
        canViewReports = true
      }

      return {
        id: project.id,
        name: project.name,
        color: project.color,
        totalBudget,
        totalSpent,
        totalHours,
        utilization,
        canViewReports
      }
    })

    // Sort by utilization (highest first) for priority display
    projectSummaries.sort((a, b) => b.utilization - a.utilization)

    return NextResponse.json({ projects: projectSummaries })
  } catch (error) {
    console.error('Failed to fetch project summaries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}