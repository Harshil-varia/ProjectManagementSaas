// app/api/reports/export-all/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'
import { startOfDay, endOfDay, format } from 'date-fns'
import * as XLSX from 'xlsx'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'




export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting export all users with historical rates...')

    // Always use current year - no parameters needed
    const currentYear = new Date().getFullYear()
    const startDate = startOfDay(new Date(currentYear, 0, 1)) // January 1st
    const endDate = endOfDay(new Date(currentYear, 11, 31))   // December 31st
    const safeDecimalToNumber = (decimal: Decimal | number | null | undefined): number => {
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

    // Get all admin users for name mapping
    const adminUsers = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true }
    });
    const adminNamesMap = new Map(adminUsers.map(admin => [admin.id, admin.name || 'Unknown Admin']));

    const hasValidRate = (rate: Decimal): boolean => {
      try {
        return rate.gt(0)
      } catch (error) {
        return false
      }
    }
    // Get all active users with their rate history
    const users = await prisma.user.findMany({
      where: { active: true },
      include: {
        rateHistory: {
          orderBy: { effectiveDate: 'asc' },
          select: {
            effectiveDate: true,
            rate: true,
            createdBy: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Get all time entries for the entire year
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
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
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    console.log(`Processing ${timeEntries.length} time entries for ${users.length} users`)

    // Generate all 12 months for the year
    const months = [
      `${currentYear}-01`, `${currentYear}-02`, `${currentYear}-03`, `${currentYear}-04`,
      `${currentYear}-05`, `${currentYear}-06`, `${currentYear}-07`, `${currentYear}-08`,
      `${currentYear}-09`, `${currentYear}-10`, `${currentYear}-11`, `${currentYear}-12`
    ]

    // Helper function to get month name
    const getMonthName = (monthStr: string) => {
      const [year, month] = monthStr.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return format(date, 'MMM')
    }

    // Process data for ALL users using historical rates
    const usersData = await Promise.all(users.map(async (user) => {
      const userEntries = timeEntries.filter(entry => entry.user.id === user.id)
      const currentRate = parseFloat(user.employeeRate.toString())
      
      // Group by project and month with historical rate calculations
      const projectsMap = new Map()
      const monthlyTotals = new Map()
      let totalHours = 0
      let totalHistoricalSpending = 0

      // Initialize monthly totals for all 12 months
      months.forEach(month => {
        monthlyTotals.set(month, { 
          hours: 0, 
          historicalSpending: 0
        })
      })

      // Process each time entry with historical rate calculation
      for (const entry of userEntries) {
        const entryDate = new Date(entry.date)
        const monthKey = format(entryDate, 'yyyy-MM')
        const hours = parseFloat(entry.hours.toString())
        
        // Get historical rate for this specific entry date
        const historicalRate = await EnhancedSpendingCalculator.getEffectiveRateForDate(
          user.id,
          entryDate
        )
        
        const historicalSpending = hours * historicalRate

        // Project totals
        if (!projectsMap.has(entry.project.id)) {
          projectsMap.set(entry.project.id, {
            name: entry.project.name,
            monthlyHours: {},
            monthlyHistoricalSpending: {},
            totalHours: 0,
            totalHistoricalSpending: 0
          })
        }

        const project = projectsMap.get(entry.project.id)
        project.monthlyHours[monthKey] = (project.monthlyHours[monthKey] || 0) + hours
        project.monthlyHistoricalSpending[monthKey] = (project.monthlyHistoricalSpending[monthKey] || 0) + historicalSpending
        project.totalHours += hours
        project.totalHistoricalSpending += historicalSpending

        // Monthly totals
        const monthTotal = monthlyTotals.get(monthKey)
        if (monthTotal) {
          monthTotal.hours += hours
          monthTotal.historicalSpending += historicalSpending
        }

        totalHours += hours
        totalHistoricalSpending += historicalSpending
      }

      return {
        user,
        projects: Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
        monthlyTotals,
        totalHours,
        totalHistoricalSpending
      }
    }))

    console.log('Processed all user data with historical rates, creating Excel workbook...')

    // Create Excel workbook
    const workbook = XLSX.utils.book_new()

    // Enhanced Summary Sheet - Overview of all users
    const summaryData = [
      [`ALL USERS SUMMARY REPORT - ${currentYear} (Historical Rates)`],
      [`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`],
      ['Note: Uses historical rates for accurate cost calculation'],
      [''],
      ['USER', 'EMAIL', 'ROLE', 'CURRENT RATE/HR', 'TOTAL HOURS', 'TOTAL PROJECTS', 'HISTORICAL EARNINGS'],
      ...usersData.map(userData => [
        userData.user.name || userData.user.email,
        userData.user.email,
        userData.user.role,
        hasValidRate(userData.user.employeeRate) ? `$${safeDecimalToNumber(userData.user.employeeRate).toFixed(2)}` : 'N/A',
        userData.totalHours.toFixed(1),
        userData.projects.length,
        hasValidRate(userData.user.employeeRate) ? `$${userData.totalHistoricalSpending.toFixed(2)}` : 'N/A'
      ])
    ]

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    summarySheet['!cols'] = [
      { width: 20 }, // User
      { width: 25 }, // Email
      { width: 8 },  // Role
      { width: 15 }, // Current Rate
      { width: 12 }, // Total Hours
      { width: 12 }, // Total Projects
      { width: 16 }  // Historical Earnings
    ]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    // Individual sheets for ALL users with enhanced rate information
    usersData.forEach(userData => {
      const userName = (userData.user.name || userData.user.email).replace(/[^\w\s]/gi, '').substring(0, 20)
      const uniqueSheetName = `${userName}_${userData.user.id.slice(-6)}`

      // Project hours rows
      const projectRows = userData.projects.length > 0 
        ? userData.projects.map(project => [
            project.totalHours.toFixed(1),
            project.name,
            ...months.map(month => project.monthlyHours[month]?.toFixed(1) || '-'),
            project.totalHours.toFixed(1)
          ])
        : [['-', 'No Projects', ...months.map(() => '-'), '-']]

      // Historical spending rows
      const historicalSpendingRows = userData.projects.length > 0
        ? userData.projects.map(project => [
             hasValidRate(userData.user.employeeRate) ? `$${project.totalHistoricalSpending.toFixed(0)}` : '#N/A',
            project.name,
            ...months.map(month => {
              const spending = project.monthlyHistoricalSpending[month]
              return spending ? `$${spending.toFixed(0)}` : (hasValidRate(userData.user.employeeRate) ? '-' : '#N/A')
            }),
            hasValidRate(userData.user.employeeRate) ? `$${project.totalHistoricalSpending.toFixed(0)}` : '#N/A'
          ])
        : [['#N/A', 'No Projects', ...months.map(() => '#N/A'), '#N/A']]

      // Rate history rows with admin names
      const rateHistoryRows = userData.user.rateHistory.length > 0
        ? userData.user.rateHistory.map(entry => [
            format(new Date(entry.effectiveDate), 'yyyy-MM-dd'),
            `$${entry.rate.toFixed(2)}`,
            adminNamesMap.get(entry.createdBy) || 'Unknown Admin'
          ])
        : [['No rate history found', '', '']]

      // Combined data with sections: Hours, Dollars, Rate History
      const combinedData = [
        [`USER REPORT: ${userData.user.name || userData.user.email} - ${currentYear}`],
        [`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`],
        [''],
        
        // HOURS Section
        ['HOURS', 'PROJECT', ...months.map(getMonthName), 'TOTAL'],
        ...projectRows,
        [
          userData.totalHours.toFixed(1),
          'TOTAL HOURS',
          ...months.map(month => {
            const total = userData.monthlyTotals.get(month)
            return total && total.hours > 0 ? total.hours.toFixed(1) : '-'
          }),
          userData.totalHours.toFixed(1)
        ],
        
        [''], // Separator
        
        // COST Section
        ['COST (HISTORICAL RATES)', 'PROJECT', ...months.map(getMonthName), 'TOTAL'],
        ...historicalSpendingRows,
        [
          hasValidRate(userData.user.employeeRate) ? `$${userData.totalHistoricalSpending.toFixed(0)}` : '#N/A',
          'TOTAL COST',
          ...months.map(month => {
            const total = userData.monthlyTotals.get(month)
            return total && hasValidRate(userData.user.employeeRate) && total.historicalSpending > 0 ? `$${total.historicalSpending.toFixed(0)}` : '#N/A'
          }),
         hasValidRate(userData.user.employeeRate) ? `$${userData.totalHistoricalSpending.toFixed(0)}` : '#N/A'
        ],
        
        [''], // Separator
        
        // Rate History Section
        ['RATE HISTORY'],
        ['Effective Date', 'Rate', 'Changed By'],
        ...rateHistoryRows,
        [''],
        [`Current Rate: $${parseFloat(userData.user.employeeRate.toString()).toFixed(2)}`]
      ]

      // Create enhanced sheet
      const combinedSheet = XLSX.utils.aoa_to_sheet(combinedData)
      
      // Set column widths
      combinedSheet['!cols'] = [
        { width: 15 }, // First column (totals/labels)
        { width: 20 }, // Project names
        ...months.map(() => ({ width: 8 })), // Month columns
        { width: 12 }  // Total column
      ]
      
      XLSX.utils.book_append_sheet(workbook, combinedSheet, uniqueSheetName.slice(0, 31))
    })

    console.log('Excel workbook created, generating buffer...')

    // Export as Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true })
    
    console.log(`Export completed: ${excelBuffer.length} bytes`)

    return new Response(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="All_Users_Report_${currentYear}_Historical_Rates.xlsx"`
      }
    })

  } catch (error) {
    console.error('Error exporting all users report:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}