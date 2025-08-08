// app/api/users/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, format, eachMonthOfInterval } from 'date-fns'
import { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'

// Helper function to safely work with Decimal values
const safeDecimalToNumber = (decimal: Prisma.Decimal | number | null | undefined): number => {
  if (typeof decimal === 'number') {
    return isFinite(decimal) ? decimal : 0
  }
  
  if (!decimal) return 0
  
  try {
    const number = decimal.toNumber()
    return Number.isFinite(number) ? number : 0
  } catch (error) {
    console.error('Decimal conversion error:', error)
    return 0
  }
}

// Helper function to check if rate is greater than zero
const hasValidRate = (rate: Prisma.Decimal): boolean => {
  try {
    return rate.gt(0)
  } catch (error) {
    return false
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }>}
) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can export user summary reports
    if (session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await params
    const { searchParams } = new URL(request.url)
    
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const format_type = searchParams.get('format') || 'excel'
    
    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 })
    }

    const startDate = startOfDay(new Date(startDateParam))
    const endDate = endOfDay(new Date(endDateParam))

    // Get user data
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

    // Get time entries (same logic as summary API)
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

    // Generate months array
    const months = eachMonthOfInterval({ start: startDate, end: endDate })
      .map(date => format(date, 'yyyy-MM'))

    // Process data (same logic as summary API)
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

    // Convert employeeRate to number once for calculations
    const userRate = safeDecimalToNumber(user.employeeRate)

    timeEntries.forEach(entry => {
      const monthKey = format(entry.date, 'yyyy-MM')
      const hours = safeDecimalToNumber(entry.hours)
      const spending = hours * userRate

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
      
      project.monthlyHours[monthKey] = (project.monthlyHours[monthKey] || 0) + hours
      project.monthlySpending[monthKey] = (project.monthlySpending[monthKey] || 0) + spending
      project.totalHours += hours
      project.totalSpending += spending

      if (!totalsMap.has(monthKey)) {
        totalsMap.set(monthKey, { hours: 0, spending: 0 })
      }
      const monthTotal = totalsMap.get(monthKey)!
      monthTotal.hours += hours
      monthTotal.spending += spending

      totalHours += hours
      totalSpending += spending
    })

    const projects = Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    // Helper function to get month name
    const getMonthName = (monthStr: string) => {
      const [year, month] = monthStr.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return format(date, 'MMM')
    }

    // Create Excel workbook
    const workbook = XLSX.utils.book_new()

    // Hours Sheet
    const hoursData = [
      // Header row
      ['HOURS', 'PROJECT', ...months.map(getMonthName), 'TOTAL'],
      // Project rows
      ...projects.map(project => [
        project.totalHours.toFixed(1),
        project.name,
        ...months.map(month => project.monthlyHours[month]?.toFixed(1) || '-'),
        project.totalHours.toFixed(1)
      ]),
      // Total row
      [
        totalHours.toFixed(1),
        'TOTAL',
        ...months.map(month => {
          const total = totalsMap.get(month)
          return total ? total.hours.toFixed(1) : '-'
        }),
        totalHours.toFixed(1)
      ]
    ]

    const hoursSheet = XLSX.utils.aoa_to_sheet(hoursData)
    XLSX.utils.book_append_sheet(workbook, hoursSheet, 'Hours')

    // Dollars Sheet - Fixed with proper Decimal handling
    const dollarsData = [
      // Header row
      ['DOLLARS', 'PROJECT', ...months.map(getMonthName), 'TOTAL'],
      // Project rows - Fixed comparison
      ...projects.map(project => [
        hasValidRate(user.employeeRate) ? `$${project.totalSpending.toFixed(0)}` : '#N/A',
        project.name,
        ...months.map(month => {
          const spending = project.monthlySpending[month]
          return spending ? `$${spending.toFixed(0)}` : (hasValidRate(user.employeeRate) ? '-' : '#N/A')
        }),
        hasValidRate(user.employeeRate) ? `$${project.totalSpending.toFixed(0)}` : '#N/A'
      ]),
      // Total row - Fixed comparison
      [
        hasValidRate(user.employeeRate) ? `$${totalSpending.toFixed(0)}` : '#N/A',
        'TOTAL SALARY',
        ...months.map(month => {
          const total = totalsMap.get(month)
          return total && hasValidRate(user.employeeRate) ? `$${total.spending.toFixed(0)}` : '#N/A'
        }),
        hasValidRate(user.employeeRate) ? `$${totalSpending.toFixed(0)}` : '#N/A'
      ]
    ]

    const dollarsSheet = XLSX.utils.aoa_to_sheet(dollarsData)
    XLSX.utils.book_append_sheet(workbook, dollarsSheet, 'Dollars')

    if (format_type === 'csv') {
      // For CSV, export just the hours sheet
      const csv = XLSX.utils.sheet_to_csv(hoursSheet)
      
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${user.name || user.email}_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}_summary.csv"`
        }
      })
    } else {
      // Export as Excel
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      
      return new Response(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${user.name || user.email}_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}_summary.xlsx"`
        }
      })
    }

  } catch (error) {
    console.error('Error exporting user summary:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}