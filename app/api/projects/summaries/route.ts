// app/api/reports/projects/summaries/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all projects with related data
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: {
            timeEntries: true,
            projectUsers: true
          }
        },
        timeEntries: {
          include: {
            user: {
              select: {
                employeeRate: true
              }
            }
          },
          orderBy: {
            date: 'desc'
          },
          take: 1 // Get most recent activity
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Process each project to calculate summaries
    const projectSummaries = projects.map(project => {
      // Calculate total hours and spending
      let totalHours = 0
      let totalSpent = 0
      const uniqueEmployees = new Set<string>()

      // Get all time entries for calculations (not just the recent one)
      const allTimeEntries = project.timeEntries || []
      
      allTimeEntries.forEach(entry => {
        const hours = Number(entry.hours) || 0
        const rate = Number(entry.user.employeeRate) || 0
        totalHours += hours
        totalSpent += hours * rate
        uniqueEmployees.add(entry.userId)
      })

      // Budget calculations
      const totalBudget = Number(project.totalBudget)
      const q1Spent = Number(project.q1Spent)
      const q2Spent = Number(project.q2Spent)
      const q3Spent = Number(project.q3Spent)
      const q4Spent = Number(project.q4Spent)
      const calculatedTotalSpent = q1Spent + q2Spent + q3Spent + q4Spent
      
      const budgetUtilization = totalBudget > 0 ? (calculatedTotalSpent / totalBudget) * 100 : 0

      // Get last activity date
      const lastActivity = project.timeEntries.length > 0 ? project.timeEntries[0].date : null

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        active: project.active,
        totalBudget,
        q1Budget: Number(project.q1Budget),
        q2Budget: Number(project.q2Budget),
        q3Budget: Number(project.q3Budget),
        q4Budget: Number(project.q4Budget),
        q1Spent,
        q2Spent,
        q3Spent,
        q4Spent,
        totalSpent: calculatedTotalSpent,
        totalHours,
        employeeCount: uniqueEmployees.size,
        entryCount: project._count.timeEntries,
        budgetUtilization,
        lastActivity: lastActivity?.toISOString() || null
      }
    })

    // Sort by budget utilization (most concerning first)
    projectSummaries.sort((a, b) => {
      // First sort by over-budget projects
      if (a.budgetUtilization >= 100 && b.budgetUtilization < 100) return -1
      if (b.budgetUtilization >= 100 && a.budgetUtilization < 100) return 1
      
      // Then by utilization descending
      return b.budgetUtilization - a.budgetUtilization
    })

    return NextResponse.json({ projects: projectSummaries })
  } catch (error) {
    console.error('Failed to fetch project summaries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}