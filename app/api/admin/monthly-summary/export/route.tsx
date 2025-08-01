// app/api/admin/monthly-summary/export/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth' // Use the same import as your main API
import { PrismaClient } from '@/app/generated/prisma'
import * as XLSX from 'xlsx'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    console.log('Export API called') // Debug log
    
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      console.log('No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      console.log('User is not admin:', session.user.role)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())

    console.log('Export parameters:', { format, year, month }) // Debug log

    // Get the same data as the main API
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    console.log('Date range:', { startDate, endDate }) // Debug log

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
        { user: { name: 'asc' } },
        { project: { name: 'asc' } }
      ]
    })

    console.log('Found time entries:', timeEntries.length) // Debug log

    // Process data same as main API
    const summaryMap = new Map()
    
    timeEntries.forEach(entry => {
      const key = `${entry.userId}-${entry.projectId}`
      const hours = Number(entry.hours) || 0
      const rate = Number(entry.user.employeeRate) || 0
      const cost = hours * rate

      if (summaryMap.has(key)) {
        const existing = summaryMap.get(key)
        existing.aggregatedHours += hours
        existing.totalCost += cost
      } else {
        summaryMap.set(key, {
          employeeName: entry.user.name || 'N/A',
          employeeEmail: entry.user.email,
          projectCode: entry.project.description,
          projectName: entry.project.name,
          aggregatedHours: hours,
          hourlyRate: rate,
          totalCost: cost
        })
      }
    })

    const summaries = Array.from(summaryMap.values())
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

    console.log('Generated summaries:', summaries.length) // Debug log

    if (format === 'excel') {
      console.log('Generating Excel file...') // Debug log
      
      // Create Excel workbook
      const workbook = XLSX.utils.book_new()
      
      // Main summary sheet
      const summaryData = [
        [`Monthly Employee Summary - ${monthName} ${year}`],
        [''],
        ['Employee Name', 'Employee Email', 'Project Code', 'Project Name', 'Aggregated Hours', 'Hourly Rate', 'Total Cost']
      ]
      
      summaries.forEach(summary => {
        summaryData.push([
          summary.employeeName,
          summary.employeeEmail,
          summary.projectCode,
          summary.projectName,
          Number(summary.aggregatedHours.toFixed(2)),
          Number(summary.hourlyRate.toFixed(2)),
          Number(summary.totalCost.toFixed(2))
        ])
      })
      
      // Add totals row
      const totalHours = summaries.reduce((sum, s) => sum + s.aggregatedHours, 0)
      const totalCost = summaries.reduce((sum, s) => sum + s.totalCost, 0)
      
      summaryData.push([])
      summaryData.push(['', '', '', 'TOTALS', totalHours.toFixed(2), '', totalCost.toFixed(2)])
      
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
      
      // Style the sheet
      summarySheet['!cols'] = [
        { width: 20 }, // Employee Name
        { width: 25 }, // Employee Email
        { width: 15 }, // Project Code
        { width: 25 }, // Project Name
        { width: 15 }, // Aggregated Hours
        { width: 12 }, // Hourly Rate
        { width: 12 }  // Total Cost
      ]
      
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Employee Summary')
      
      // Create a simplified accounting sheet (for easy import)
      const accountingData = [
        ['Employee Name', 'Project Code', 'Hours', 'Total Cost']
      ]
      
      summaries.forEach(summary => {
        accountingData.push([
          summary.employeeName,
          summary.projectCode,
          summary.aggregatedHours.toFixed(2),
          summary.totalCost.toFixed(2)
        ])
      })
      
      const accountingSheet = XLSX.utils.aoa_to_sheet(accountingData)
      accountingSheet['!cols'] = [
        { width: 20 }, // Employee Name
        { width: 15 }, // Project Code
        { width: 12 }, // Hours
        { width: 12 }  // Total Cost
      ]
      
      XLSX.utils.book_append_sheet(workbook, accountingSheet, 'For Accounting Software')
      
      // Employee totals sheet
      const employeeTotals = new Map()
      summaries.forEach(summary => {
        const key = summary.employeeEmail
        if (!employeeTotals.has(key)) {
          employeeTotals.set(key, {
            name: summary.employeeName,
            email: summary.employeeEmail,
            totalHours: 0,
            totalCost: 0,
            projectCount: 0
          })
        }
        const total = employeeTotals.get(key)
        total.totalHours += summary.aggregatedHours
        total.totalCost += summary.totalCost
        total.projectCount += 1
      })
      
      const employeeTotalData = [
        [`Employee Totals - ${monthName} ${year}`],
        [''],
        ['Employee Name', 'Employee Email', 'Total Hours', 'Total Cost', 'Projects Worked']
      ]
      
      Array.from(employeeTotals.values()).forEach((total: any) => {
        employeeTotalData.push([
          total.name,
          total.email,
          total.totalHours.toFixed(2),
          total.totalCost.toFixed(2),
          total.projectCount
        ])
      })
      
      const employeeTotalSheet = XLSX.utils.aoa_to_sheet(employeeTotalData)
      employeeTotalSheet['!cols'] = [
        { width: 20 }, // Employee Name
        { width: 25 }, // Employee Email
        { width: 12 }, // Total Hours
        { width: 12 }, // Total Cost
        { width: 15 }  // Projects Worked
      ]
      
      XLSX.utils.book_append_sheet(workbook, employeeTotalSheet, 'Employee Totals')
      
      // Generate Excel buffer
      try {
        const excelBuffer = XLSX.write(workbook, { 
          type: 'buffer', 
          bookType: 'xlsx',
          compression: true
        })
        
        console.log('Excel buffer created, size:', excelBuffer.length) // Debug log
        
        const filename = `Monthly_Employee_Summary_${year}_${month.toString().padStart(2, '0')}.xlsx`
        
        return new NextResponse(excelBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': excelBuffer.length.toString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
      } catch (xlsxError) {
        console.error('Error generating Excel:', xlsxError)
        return NextResponse.json({ error: 'Failed to generate Excel file' }, { status: 500 })
      }
    }
    
    if (format === 'csv') {
      console.log('Generating CSV file...') // Debug log
      
      // Generate CSV for accounting software import
      const csvData = [
        ['Employee Name', 'Project Code', 'Project Name' ,'Aggregated Hours', 'Total Cost']
      ]
      
      summaries.forEach(summary => {
        csvData.push([
          summary.employeeName,
          summary.projectCode,
          summary.projectName,
          summary.aggregatedHours.toFixed(2),
          summary.totalCost.toFixed(2)
        ])
      })
      
      const csvContent = csvData.map(row => 
        row.map(cell => 
          typeof cell === 'string' && cell.includes(',') 
            ? `"${cell.replace(/"/g, '""')}"` 
            : cell
        ).join(',')
      ).join('\n')
      
      console.log('CSV content generated, length:', csvContent.length) // Debug log
      
      const filename = `Monthly_Employee_Summary_${year}_${month.toString().padStart(2, '0')}.csv`
      
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': csvContent.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    console.log('Invalid format requested:', format)
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })

  } catch (error) {
    console.error('Failed to export monthly summary:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}