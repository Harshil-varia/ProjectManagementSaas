// app/api/admin/monthly-summary/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { PrismaClient } from '@/app/generated/prisma'

const prisma = new PrismaClient()

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

    // Calculate start and end dates for the month
    const startDate = new Date(year, month - 1, 1) // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59) // Last day of month

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
        { user: { name: 'asc' } },
        { project: { name: 'asc' } }
      ]
    })

    // Group by employee and project to aggregate hours
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
    }>()

    timeEntries.forEach(entry => {
      const key = `${entry.userId}-${entry.projectId}`
      const hours = Number(entry.hours) || 0
      const rate = Number(entry.user.employeeRate) || 0
      const cost = hours * rate

      if (summaryMap.has(key)) {
        const existing = summaryMap.get(key)!
        existing.aggregatedHours += hours
        existing.totalCost += cost
      } else {
        summaryMap.set(key, {
          employeeId: entry.user.id,
          employeeName: entry.user.name,
          employeeEmail: entry.user.email,
          employeeRate: rate,
          projectId: entry.project.id,
          projectName: entry.project.name,
          projectCode: entry.project.description, // Generate project code from ID
          aggregatedHours: hours,
          totalCost: cost
        })
      }
    })

    const summaries = Array.from(summaryMap.values())

    // Calculate totals
    const totals = {
      totalHours: summaries.reduce((sum, s) => sum + s.aggregatedHours, 0),
      totalCost: summaries.reduce((sum, s) => sum + s.totalCost, 0),
      employeeCount: new Set(summaries.map(s => s.employeeId)).size,
      projectCount: new Set(summaries.map(s => s.projectId)).size
    }

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

    return NextResponse.json({
      month: monthName,
      year,
      summaries,
      totals
    })

  } catch (error) {
    console.error('Failed to fetch monthly summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}