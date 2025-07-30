import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth' // Change this line
import { prisma } from '@/lib/prisma' // Change this line
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(NEXT_AUTH_CONFIG) // Updated
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'week'
  const userId = searchParams.get('userId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  try {
    // Determine date range
    let dateFilter: any = {}
    const now = new Date()
        
    if (startDate && endDate) {
      dateFilter = {
        startTime: { gte: new Date(startDate), lte: new Date(endDate) }
      }
    } else {
      switch (period) {
        case 'week':
          dateFilter = {
            startTime: { gte: startOfWeek(now), lte: endOfWeek(now) }
          }
          break
        case 'month':
          dateFilter = {
            startTime: { gte: startOfMonth(now), lte: endOfMonth(now) }
          }
          break
        default:
          dateFilter = {
            startTime: { gte: startOfWeek(now), lte: endOfWeek(now) }
          }
      }
    }

    // Filter by user if specified (admin can see all users)
    const userFilter = userId ? { userId } : 
      (session.user.role === 'ADMIN' ? {} : { userId: session.user.id })

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        ...dateFilter,
        ...userFilter,
        endTime: { not: null }
      },
      include: {
        project: true,
        user: true
      },
      orderBy: { startTime: 'desc' }
    })

    // Calculate summaries
    const totalHours = timeEntries.reduce((sum, entry) => {
      if (entry.endTime) {
        return sum + (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
      }
      return sum
    }, 0)

    // Project breakdown
    const projectBreakdown = timeEntries.reduce((acc, entry) => {
      if (entry.endTime && entry.project) {
        const hours = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
        acc[entry.project.id] = {
          name: entry.project.name,
          color: entry.project.color,
          hours: (acc[entry.project.id]?.hours || 0) + hours
        }
      }
      return acc
    }, {} as Record<string, { name: string; color: string; hours: number }>)

    // Daily breakdown
    const dailyBreakdown = timeEntries.reduce((acc, entry) => {
      if (entry.endTime) {
        const day = format(entry.startTime, 'yyyy-MM-dd')
        const hours = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
        acc[day] = (acc[day] || 0) + hours
      }
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      totalHours,
      projectBreakdown: Object.values(projectBreakdown),
      dailyBreakdown: Object.entries(dailyBreakdown).map(([date, hours]) => ({
        date,
        hours
      })),
      entries: timeEntries.map(entry => ({
        id: entry.id,
        start: entry.startTime.toISOString(),
        end: entry.endTime?.toISOString() || null,
        duration: entry.endTime ? (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60) : 0,
        project: entry.project,
        user: entry.user,
        description: entry.description
      }))
    })
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}