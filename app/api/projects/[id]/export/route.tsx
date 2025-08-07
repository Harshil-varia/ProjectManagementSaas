// app/api/projects/[id]/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'

// Helper functions from detailed report
function getFiscalQuarter(date: Date): 1 | 2 | 3 | 4 {
  const month = date.getMonth() + 1
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const projectId = params.id
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const format = searchParams.get('format') || 'excel'

    // Permission check
    const hasPermission = session.user.role === 'ADMIN' || 
      await prisma.projectPermission.findFirst({
        where: {
          userId: session.user.id,
          projectId,
          permission: { in: ['VIEW_REPORTS', 'EDIT_BUDGETS', 'FULL_ACCESS'] }
        }
      })
    
    if (!hasPermission) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Generate report data
    const reportData = await generateDetailedReportData(projectId, year, session.user.id)

    if (format === 'excel') {
      return generateExcelExport(reportData, year)
    } else {
      return generateCSVExport(reportData, year)
    }
  } catch (error) {
    console.error('Export failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function generateDetailedReportData(projectId: string, year: number, userId: string) {
  // Same logic as detailed report API
  const project = await prisma.project.findUnique({
    where: { id: projectId }
  })

  if (!project) throw new Error('Project not found')

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

  // Process data for each employee using historical rates
  const uniqueUsers = new Map<string, any>()
  timeEntries.forEach(entry => {
    if (!uniqueUsers.has(entry.user.id)) {
      uniqueUsers.set(entry.user.id, entry.user)
    }
  })

  const employees = await Promise.all(Array.from(uniqueUsers.values()).map(async (user) => {
    const userEntries = timeEntries.filter(entry => entry.user.id === user.id)
    
    // Initialize data
    const monthlyHours: Record<string, number> = {}
    const monthlySpending: Record<string, number> = {}
    const quarterlyHours = { q1: 0, q2: 0, q3: 0, q4: 0 }
    const quarterlySpending = { q1: 0, q2: 0, q3: 0, q4: 0 }

    // Process each time entry with historical rate calculation
    for (const entry of userEntries) {
      const entryDate = new Date(entry.date)
      const monthKey = getMonthKey(entryDate)
      const quarter = getFiscalQuarter(entryDate)
      const hours = Number(entry.hours) || 0
      
      // Get historical rate for this specific entry date
      const historicalRate = await EnhancedSpendingCalculator.getEffectiveRateForDate(
        entry.user.id, 
        entryDate
      )
      
      const cost = hours * historicalRate

      // Monthly totals
      monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + hours
      monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + cost

      // Quarterly totals
      quarterlyHours[`q${quarter}` as keyof typeof quarterlyHours] += hours
      quarterlySpending[`q${quarter}` as keyof typeof quarterlySpending] += cost
    }

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
  }))

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

  return {
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
    employees: employees.sort((a, b) => b.totalHours - a.totalHours),
    totals,
    calculationMethod: 'historical_rates',
    lastCalculated: new Date().toISOString()
  }
}

function generateExcelExport(reportData: any, year: number) {
  const workbook = XLSX.utils.book_new()

  // 1. Hours Sheet
  const hoursData = [
    [`${reportData.project.name} - Hours Report`],
    [`Fiscal Year: ${year}/${year+1}`, `Generated: ${new Date().toLocaleDateString()}`],
    [],
    ['HOURS', 'EMPLOYEE', 
      'APR', 'MAY', 'JUN', 'Total Q1',
      'JUL', 'AUG', 'SEP', 'Total Q2',
      'OCT', 'NOV', 'DEC', 'Total Q3',
      'JAN', 'FEB', 'MAR', 'Total Q4'
    ]
  ];

  // Add employee hours data
  reportData.employees.forEach((employee: any) => {
    hoursData.push([
      employee.totalHours.toFixed(1),
      employee.name || employee.email,
      ...getQuarterMonthValues(employee, 'q1', year, false),
      ...getQuarterMonthValues(employee, 'q2', year, false),
      ...getQuarterMonthValues(employee, 'q3', year, false),
      ...getQuarterMonthValues(employee, 'q4', year, false)
    ])
  })

  // Add totals row
  hoursData.push([
    reportData.totals.totalHours.toFixed(1),
    'TOTAL',
    ...getQuarterMonthValues(reportData.totals, 'q1', year, false),
    ...getQuarterMonthValues(reportData.totals, 'q2', year, false),
    ...getQuarterMonthValues(reportData.totals, 'q3', year, false),
    ...getQuarterMonthValues(reportData.totals, 'q4', year, false)
  ])

  const hoursSheet = XLSX.utils.aoa_to_sheet(hoursData)
  XLSX.utils.book_append_sheet(workbook, hoursSheet, 'Hours')

  // 2. Dollars Sheet
  const dollarsData = [
    [`${reportData.project.name} - Dollars Report`],
    [`Fiscal Year: ${year}/${year+1}`, `Generated: ${new Date().toLocaleDateString()}`],
    [],
    ['DOLLARS', 'EMPLOYEE', 
      'APR', 'MAY', 'JUN', 'Total Q1',
      'JUL', 'AUG', 'SEP', 'Total Q2',
      'OCT', 'NOV', 'DEC', 'Total Q3',
      'JAN', 'FEB', 'MAR', 'Total Q4'
    ]
  ];

  // Add employee dollars data
  reportData.employees.forEach((employee: any) => {
    dollarsData.push([
      employee.rate > 0 ? formatCurrency(employee.totalSpending) : '#N/A',
      employee.name || employee.email,
      ...getQuarterMonthValues(employee, 'q1', year, true),
      ...getQuarterMonthValues(employee, 'q2', year, true),
      ...getQuarterMonthValues(employee, 'q3', year, true),
      ...getQuarterMonthValues(employee, 'q4', year, true)
    ])
  })

  // Add totals row
  dollarsData.push([
    reportData.totals.totalSpending > 0 ? formatCurrency(reportData.totals.totalSpending) : '#N/A',
    'TOTAL SALARY',
    ...getQuarterMonthValues(reportData.totals, 'q1', year, true),
    ...getQuarterMonthValues(reportData.totals, 'q2', year, true),
    ...getQuarterMonthValues(reportData.totals, 'q3', year, true),
    ...getQuarterMonthValues(reportData.totals, 'q4', year, true)
  ])

  const dollarsSheet = XLSX.utils.aoa_to_sheet(dollarsData)
  XLSX.utils.book_append_sheet(workbook, dollarsSheet, 'Dollars')

  // 3. Budget Sheet
  const budgetData = [
    [`${reportData.project.name} - Budget Report`],
    [`Fiscal Year: ${year}/${year+1}`, `Generated: ${new Date().toLocaleDateString()}`],
    [],
    ['QUARTER', 'BUDGET', 'SPENT', 'STATUS', 'VARIANCE', 'UTILIZATION'],
    ...generateBudgetRows(reportData, 'q1'),
    ...generateBudgetRows(reportData, 'q2'),
    ...generateBudgetRows(reportData, 'q3'),
    ...generateBudgetRows(reportData, 'q4'),
    [],
    ['BUDGET SUMMARY'],
    [],
    ['', 'Total', 'Q1', 'Q2', 'Q3', 'Q4'],
    ...generateBudgetTable(reportData)
  ];

  const budgetSheet = XLSX.utils.aoa_to_sheet(budgetData)
  XLSX.utils.book_append_sheet(workbook, budgetSheet, 'Budget')

  // Generate Excel buffer
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const cleanProjectName = reportData.project.name.replace(/[^a-zA-Z0-9]/g, '_')
  const filename = `${cleanProjectName}_${year}_detailed_report.xlsx`

  return new NextResponse(excelBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}

// Helper functions
function getQuarterMonthValues(data: any, quarter: string, year: number, isCurrency: boolean) {
  const months = getQuarterMonths(quarter, year);
  const values = [];
  
  for (const month of months) {
    const monthKey = quarter === 'q4' ? 
      `${year+1}-${month}` : 
      `${year}-${month}`;
    
    let value = data.monthlyHours[monthKey] || 0;
    if (isCurrency && 'monthlySpending' in data) {
      value = data.monthlySpending[monthKey] || 0;
    }
    
    values.push(
      value ? 
        (isCurrency ? formatCurrency(value) : value.toFixed(1)) : 
        (isCurrency ? '#N/A' : '-')
    );
  }
  
  // Add quarter total
  let qTotal = data.quarterlyHours[quarter] || 0;
  if (isCurrency && 'quarterlySpending' in data) {
    qTotal = data.quarterlySpending[quarter] || 0;
  }
  
  values.push(
    qTotal ? 
      (isCurrency ? formatCurrency(qTotal) : qTotal.toFixed(1)) : 
      (isCurrency ? '#N/A' : '-')
  );
  
  return values;
}

function getQuarterMonths(quarter: string, year: number) {
  const months: Record<string, string[]> = {
    q1: ['04', '05', '06'],
    q2: ['07', '08', '09'],
    q3: ['10', '11', '12'],
    q4: ['01', '02', '03'] // Next year
  };
  return months[quarter];
}

function generateBudgetRows(reportData: any, quarter: string) {
  const quarterLabels = {
    q1: 'Q1 (Apr-Jun)',
    q2: 'Q2 (Jul-Sep)',
    q3: 'Q3 (Oct-Dec)',
    q4: 'Q4 (Jan-Mar)'
  };
  
  const budget = reportData.budget[`${quarter}Budget`];
  const spent = reportData.budget[`${quarter}Spent`];
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  
  let status, variance;
  if (budget === 0) {
    status = 'N/A';
    variance = 'N/A';
  } else if (spent > budget) {
    status = 'Over Budget';
    variance = `-${formatCurrency(spent - budget)}`;
  } else {
    status = 'Under Budget';
    variance = formatCurrency(budget - spent);
  }
  
  return [
    [
      quarterLabels[quarter as keyof typeof quarterLabels],
      formatCurrency(budget),
      formatCurrency(spent),
      status,
      variance,
      `${percentage.toFixed(1)}%`
    ]
  ];
}

function generateBudgetTable(reportData: any) {
  const { budget } = reportData;
  return [
    ['Allocated Budget', 
      formatCurrency(budget.totalBudget), 
      formatCurrency(budget.q1Budget), 
      formatCurrency(budget.q2Budget), 
      formatCurrency(budget.q3Budget), 
      formatCurrency(budget.q4Budget)
    ],
    ['Actual Spent', 
      formatCurrency(budget.totalSpent), 
      formatCurrency(budget.q1Spent), 
      formatCurrency(budget.q2Spent), 
      formatCurrency(budget.q3Spent), 
      formatCurrency(budget.q4Spent)
    ],
    ['Variance', 
      formatCurrency(budget.totalBudget - budget.totalSpent), 
      formatCurrency(budget.q1Budget - budget.q1Spent), 
      formatCurrency(budget.q2Budget - budget.q2Spent), 
      formatCurrency(budget.q3Budget - budget.q3Spent), 
      formatCurrency(budget.q4Budget - budget.q4Spent)
    ],
    ['Utilization %', 
      budget.totalBudget > 0 ? `${((budget.totalSpent / budget.totalBudget) * 100).toFixed(1)}%` : 'N/A', 
      budget.q1Budget > 0 ? `${((budget.q1Spent / budget.q1Budget) * 100).toFixed(1)}%` : 'N/A', 
      budget.q2Budget > 0 ? `${((budget.q2Spent / budget.q2Budget) * 100).toFixed(1)}%` : 'N/A', 
      budget.q3Budget > 0 ? `${((budget.q3Spent / budget.q3Budget) * 100).toFixed(1)}%` : 'N/A', 
      budget.q4Budget > 0 ? `${((budget.q4Spent / budget.q4Budget) * 100).toFixed(1)}%` : 'N/A'
    ]
  ];
}

function generateCSVExport(reportData: any, year: number) {
  // This would be similar to the Excel export but in CSV format
  // For brevity, we'll just return a placeholder
  return new NextResponse('CSV export not implemented', {
    status: 501,
    headers: { 'Content-Type': 'text/plain' }
  })
}