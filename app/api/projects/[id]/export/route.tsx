import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
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

    // Get project and time entries
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const startDate = new Date(year, 3, 1) // April
    const endDate = new Date(year + 1, 2, 31) // March next year

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        projectId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        user: {
          select: {
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

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'Date',
        'Employee',
        'Email',
        'Hours',
        'Rate',
        'Cost',
        'Description'
      ].join(',')

      const csvRows = timeEntries.map(entry => [
        entry.date.toISOString().split('T')[0],
        entry.user.name || 'N/A',
        entry.user.email,
        Number(entry.hours).toFixed(2),
        Number(entry.user.employeeRate).toFixed(2),
        (Number(entry.hours) * Number(entry.user.employeeRate)).toFixed(2),
        `"${entry.description || ''}"`
      ].join(','))

      const csvContent = [csvHeaders, ...csvRows].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${project.name}_${year}_report.csv"`
        }
      })
    }

    // Default JSON export
    return NextResponse.json({
      project,
      timeEntries: timeEntries.map(entry => ({
        date: entry.date,
        employee: entry.user.name,
        email: entry.user.email,
        hours: Number(entry.hours),
        rate: Number(entry.user.employeeRate),
        cost: Number(entry.hours) * Number(entry.user.employeeRate),
        description: entry.description
      }))
    })

  } catch (error) {
    console.error('Failed to export report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}