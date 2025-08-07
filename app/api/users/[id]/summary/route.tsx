// app/api/users/[id]/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'
import { startOfDay, endOfDay, format, eachMonthOfInterval } from 'date-fns'

interface UserSummaryData {
  user: {
    id: string
    name: string | null
    email: string
    rate: number
  }
  period: {
    startDate: string
    endDate: string
  }
  projects: Array<{
    id: string
    name: string
    color: string
    monthlyHours: Record<string, number> // 'YYYY-MM' -> hours
    monthlySpending: Record<string, number> // 'YYYY-MM' -> spending
    totalHours: number
    totalSpending: number
  }>
  totals: {
    monthlyHours: Record<string, number>
    monthlySpending: Record<string, number>
    totalHours: number
    totalSpending: number
  }
  months: string[] // ['2025-01', '2025-02', ...]
  rateHistory: Array<{
    rate: number
    effectiveDate: string
    createdAt: string
    createdBy: string
  }>
  calculationMethod: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can view user summary reports
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userId = await params.id
    const { searchParams } = new URL(request.url)
    
    // Get date range from query params
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    
    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 })
    }

    const startDate = startOfDay(new Date(startDateParam))
    const endDate = endOfDay(new Date(endDateParam))

    console.log(`Generating user summary for ${userId} from ${startDate.toISOString()} to ${endDate.toISOString()} with historical rates`)

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        employeeRate: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get rate history for the user within the date range
    const rateHistory = await prisma.rateHistory.findMany({
      where: {
        userId: userId,
        effectiveDate: {
          lte: endDate // Include all rates that could affect this period
        }
      },
      orderBy: {
        effectiveDate: 'desc'
      }
    })

    // Get all time entries for the user within the date range
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    console.log(`Found ${timeEntries.length} time entries and ${rateHistory.length} rate changes`)

    // Generate months array for the date range
    const months = eachMonthOfInterval({ start: startDate, end: endDate })
      .map(date => format(date, 'yyyy-MM'))

    // Group time entries by project and month using historical rates
    const projectsMap = new Map<string, {
      id: string
      name: string
      color: string
      monthlyHours: Record<string, number>
      monthlySpending: Record<string, number>
      totalHours: number
      totalSpending: number
    }>()

    const totalsMap = new Map<string, { hours: number; spending: number }>()
    let totalHours = 0
    let totalSpending = 0

    // Process each time entry with historical rate calculation
    for (const entry of timeEntries) {
      const monthKey = format(entry.date, 'yyyy-MM')
      const hours = parseFloat(entry.hours.toString())
      
      // Get the historical rate for this specific entry date
      const historicalRate = await EnhancedSpendingCalculator.getEffectiveRateForDate(
        userId,
        new Date(entry.date)
      )
      
      const spending = hours * historicalRate

      // Initialize project if not exists
      if (!projectsMap.has(entry.project.id)) {
        projectsMap.set(entry.project.id, {
          id: entry.project.id,
          name: entry.project.name,
          color: entry.project.color,
          monthlyHours: {},
          monthlySpending: {},
          totalHours: 0,
          totalSpending: 0
        })
      }

      const project = projectsMap.get(entry.project.id)!
      
      // Add to project totals
      project.monthlyHours[monthKey] = (project.monthlyHours[monthKey] || 0) + hours
      project.monthlySpending[monthKey] = (project.monthlySpending[monthKey] || 0) + spending
      project.totalHours += hours
      project.totalSpending += spending

      // Add to overall totals
      if (!totalsMap.has(monthKey)) {
        totalsMap.set(monthKey, { hours: 0, spending: 0 })
      }
      const monthTotal = totalsMap.get(monthKey)!
      monthTotal.hours += hours
      monthTotal.spending += spending

      totalHours += hours
      totalSpending += spending
    }

    // Convert maps to arrays and objects
    const projects = Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    
    const monthlyHours: Record<string, number> = {}
    const monthlySpending: Record<string, number> = {}
    
    totalsMap.forEach((total, monthKey) => {
      monthlyHours[monthKey] = total.hours
      monthlySpending[monthKey] = total.spending
    })

    const reportData: UserSummaryData = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        rate: parseFloat(user.employeeRate.toString()) // Current rate for reference
      },
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      projects,
      totals: {
        monthlyHours,
        monthlySpending,
        totalHours,
        totalSpending
      },
      months,
      rateHistory: rateHistory.map(rh => ({
        rate: parseFloat(rh.rate.toString()),
        effectiveDate: rh.effectiveDate.toISOString(),
        createdAt: rh.createdAt.toISOString(),
        createdBy: rh.createdBy
      })),
      calculationMethod: 'historical_rates'
    }

    console.log(`Generated user summary: ${projects.length} projects, ${totalHours.toFixed(2)} hours, $${totalSpending.toFixed(2)} total spending`)

    return NextResponse.json(reportData)

  } catch (error) {
    console.error('Error fetching user summary:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}