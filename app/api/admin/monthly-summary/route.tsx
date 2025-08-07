// app/api/admin/monthly-summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { PrismaClient } from '@/app/generated/prisma'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'

const prisma = new PrismaClient()

interface RatePeriod {
  rate: number
  effectiveDate: string
  endDate: string | null
  hours: number
  cost: number
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())
    const includeRateDetails = searchParams.get('includeRateDetails') === 'true'

    // Calculate start and end dates for the month
    const startDate = new Date(year, month - 1, 1) // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59) // Last day of month

    console.log('Fetching monthly summary with historical rates:', { year, month, startDate, endDate, includeRateDetails })

    // Get all time entries for the month with user and project information
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
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
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            description: true
          }
        }
      },
      orderBy: [
        { date: 'asc' },
        { user: { name: 'asc' } },
        { project: { name: 'asc' } }
      ]
    })

    console.log(`Found ${timeEntries.length} time entries for the month`)

    // Get all rate changes that occurred during this month
    const rateChangesInPeriod = await prisma.rateHistory.count({
      where: {
        effectiveDate: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // Group by employee and project to aggregate hours using historical rates with period breakdown
    const summaryMap = new Map<string, {
      employeeId: string
      employeeName: string | null
      employeeEmail: string
      employeeRate: number
      projectId: string
      projectName: string
      projectCode: string | null
      aggregatedHours: number
      totalCost: number
      ratePeriods: RatePeriod[]
      hasRateChanges: boolean
    }>()

    // Process each time entry with detailed rate period tracking
    for (const entry of timeEntries) {
      const key = `${entry.userId}-${entry.projectId}`
      const hours = Number(entry.hours) || 0
      const entryDate = new Date(entry.date)
      
      // Get the historical rate for this specific entry date
      const historicalRate = await EnhancedSpendingCalculator.getEffectiveRateForDate(
        entry.userId, 
        entryDate
      )
      
      const cost = hours * historicalRate

      if (summaryMap.has(key)) {
        const existing = summaryMap.get(key)!
        existing.aggregatedHours += hours
        existing.totalCost += cost

        // Add to existing rate period or create new one
        if (includeRateDetails) {
          const existingPeriod = existing.ratePeriods.find(p => 
            Math.abs(p.rate - historicalRate) < 0.01
          )
          
          if (existingPeriod) {
            existingPeriod.hours += hours
            existingPeriod.cost += cost
          } else {
            existing.ratePeriods.push({
              rate: historicalRate,
              effectiveDate: entryDate.toISOString(),
              endDate: null, // Will be calculated later
              hours,
              cost
            })
            existing.hasRateChanges = true
          }
        }
      } else {
        const ratePeriods: RatePeriod[] = includeRateDetails ? [{
          rate: historicalRate,
          effectiveDate: entryDate.toISOString(),
          endDate: null,
          hours,
          cost
        }] : []

        summaryMap.set(key, {
          employeeId: entry.user.id,
          employeeName: entry.user.name,
          employeeEmail: entry.user.email,
          employeeRate: Number(entry.user.employeeRate), // Current rate for display
          projectId: entry.project.id,
          projectName: entry.project.name,
          projectCode: entry.project.description,
          aggregatedHours: hours,
          totalCost: cost,
          ratePeriods,
          hasRateChanges: false
        })
      }
    }

    // Post-process to determine rate change periods and sort them
    if (includeRateDetails) {
      for (const summary of summaryMap.values()) {
        if (summary.ratePeriods.length > 1) {
          summary.hasRateChanges = true
          
          // Sort rate periods by effective date
          summary.ratePeriods.sort((a, b) => 
            new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
          )
          
          // Set end dates for each period
          for (let i = 0; i < summary.ratePeriods.length - 1; i++) {
            const nextPeriod = summary.ratePeriods[i + 1]
            summary.ratePeriods[i].endDate = nextPeriod.effectiveDate
          }
        }
      }
    }

    const summaries = Array.from(summaryMap.values())

    // Calculate totals
    const totals = {
      totalHours: summaries.reduce((sum, s) => sum + s.aggregatedHours, 0),
      totalCost: summaries.reduce((sum, s) => sum + s.totalCost, 0),
      employeeCount: new Set(summaries.map(s => s.employeeId)).size,
      projectCount: new Set(summaries.map(s => s.projectId)).size
    }

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

    console.log(`Generated monthly summary: ${summaries.length} entries, total cost: ${totals.totalCost.toFixed(2)}, rate changes: ${rateChangesInPeriod}`)

    return NextResponse.json({
      month: monthName,
      year,
      summaries,
      totals,
      rateChangesInPeriod
    })

  } catch (error) {
    console.error('Failed to fetch monthly summary:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}