// app/api/reports/project/[id]/detailed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise< {
    id: string
  }>
}

// Helper function to determine quarter based on custom fiscal year (Apr-Mar)
function getFiscalQuarter(date: Date): 1 | 2 | 3 | 4 {
  const month = date.getMonth() + 1 // 1-12
  if (month >= 4 && month <= 6) return 1  // Q1: Apr-Jun
  if (month >= 7 && month <= 9) return 2  // Q2: Jul-Sep
  if (month >= 10 && month <= 12) return 3 // Q3: Oct-Dec
  return 4 // Q4: Jan-Mar
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = params
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

    // Check permissions
    const hasPermission = session.user.role === 'ADMIN' || 
      await prisma.projectPermission.findFirst({
        where: {
          userId: session.user.id,
          projectId,
          permission: { in: ['VIEW_REPORTS', 'EDIT_BUDGETS', 'FULL_ACCESS'] }
        }
      })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get project details
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Calculate fiscal year date ranges
    const fiscalYearStart = new Date(year, 3, 1) // April 1st
    const fiscalYearEnd = new Date(year + 1, 2, 31) // March 31st next year

    // Get all time entries for the fiscal year
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        projectId,
        date: {
          gte: fiscalYearStart,
          lte: fiscalYearEnd
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeRate: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    // Get all unique users who worked on this project
    const uniqueUsers = new Map<string, any>()
    timeEntries.forEach(entry => {
      if (!uniqueUsers.has(entry.user.id)) {
        uniqueUsers.set(entry.user.id, entry.user)
      }
    })

    // Process data for each employee
    const employees = Array.from(uniqueUsers.values()).map(user => {
      const userEntries = timeEntries.filter(entry => entry.user.id === user.id)
      
      // Initialize monthly data
      const monthlyHours: Record<string, number> = {}
      const monthlySpending: Record<string, number> = {}
      
      // Initialize quarterly data
      const quarterlyHours = { q1: 0, q2: 0, q3: 0, q4: 0 }
      const quarterlySpending = { q1: 0, q2: 0, q3: 0, q4: 0 }

      // Process each time entry
      userEntries.forEach(entry => {
        const entryDate = new Date(entry.date)
        const monthKey = getMonthKey(entryDate)
        const quarter = getFiscalQuarter(entryDate)
        const hours = Number(entry.hours) || 0
        const rate = Number(user.employeeRate) || 0
        const cost = hours * rate

        // Monthly totals
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + hours
        monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + cost

        // Quarterly totals
        quarterlyHours[`q${quarter}` as keyof typeof quarterlyHours] += hours
        quarterlySpending[`q${quarter}` as keyof typeof quarterlySpending] += cost
      })

      const totalHours = Object.values(quarterlyHours).reduce((sum, h) => sum + h, 0)
      const totalSpending = Object.values(quarterlySpending).reduce((sum, s) => sum + s, 0)

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        rate: Number(user.employeeRate),
        monthlyHours,
        monthlySpending,
        quarterlyHours,
        quarterlySpending,
        totalHours,
        totalSpending
      }
    })

    // Calculate totals across all employees
    const totals = {
      monthlyHours: {} as Record<string, number>,
      monthlySpending: {} as Record<string, number>,
      quarterlyHours: { q1: 0, q2: 0, q3: 0, q4: 0 },
      quarterlySpending: { q1: 0, q2: 0, q3: 0, q4: 0 },
      totalHours: 0,
      totalSpending: 0
    }

    employees.forEach(employee => {
      // Monthly totals
      Object.entries(employee.monthlyHours).forEach(([month, hours]) => {
        totals.monthlyHours[month] = (totals.monthlyHours[month] || 0) + hours
      })
      Object.entries(employee.monthlySpending).forEach(([month, spending]) => {
        totals.monthlySpending[month] = (totals.monthlySpending[month] || 0) + spending
      })

      // Quarterly totals
      Object.entries(employee.quarterlyHours).forEach(([quarter, hours]) => {
        totals.quarterlyHours[quarter as keyof typeof totals.quarterlyHours] += hours
      })
      Object.entries(employee.quarterlySpending).forEach(([quarter, spending]) => {
        totals.quarterlySpending[quarter as keyof typeof totals.quarterlySpending] += spending
      })

      // Overall totals
      totals.totalHours += employee.totalHours
      totals.totalSpending += employee.totalSpending
    })

    // Update project spent amounts in database (real-time calculation)
    await prisma.project.update({
      where: { id: projectId },
      data: {
        q1Spent: totals.quarterlySpending.q1,
        q2Spent: totals.quarterlySpending.q2,
        q3Spent: totals.quarterlySpending.q3,
        q4Spent: totals.quarterlySpending.q4
      }
    })

    // Generate all months for the fiscal year
    const months: string[] = []
    for (let month = 4; month <= 15; month++) {
      const actualMonth = month > 12 ? month - 12 : month
      const actualYear = month > 12 ? year + 1 : year
      months.push(`${actualYear}-${actualMonth.toString().padStart(2, '0')}`)
    }

    const reportData = {
      project: {
        id: project.id,
        name: project.name,
        color: project.color
      },
      period: {
        year,
        startDate: fiscalYearStart.toISOString(),
        endDate: fiscalYearEnd.toISOString()
      },
      budget: {
        q1Budget: Number(project.q1Budget),
        q2Budget: Number(project.q2Budget),
        q3Budget: Number(project.q3Budget),
        q4Budget: Number(project.q4Budget),
        totalBudget: Number(project.totalBudget),
        q1Spent: totals.quarterlySpending.q1,
        q2Spent: totals.quarterlySpending.q2,
        q3Spent: totals.quarterlySpending.q3,
        q4Spent: totals.quarterlySpending.q4,
        totalSpent: totals.totalSpending
      },
      employees: employees.sort((a, b) => b.totalHours - a.totalHours), // Sort by total hours desc
      totals,
      months
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error('Failed to fetch detailed project report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}