import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startOfDay, startOfWeek, subDays } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await getServerSession(NEXT_AUTH_CONFIG)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    })

    const today = startOfDay(new Date())
    const weekStart = startOfWeek(new Date())
    const yesterday = subDays(new Date(), 1)

    const userDataPromises = users.map(async (user) => {
      // Get today's time
      const todayEntries = await prisma.timeEntry.findMany({
        where: {
          userId: user.id,
          startTime: { gte: today },
          endTime: { not: null }
        }
      })

      // Get week's time
      const weekEntries = await prisma.timeEntry.findMany({
        where: {
          userId: user.id,
          startTime: { gte: weekStart },
          endTime: { not: null }
        }
      })

      // Get last entry date
      const lastEntry = await prisma.timeEntry.findFirst({
        where: { userId: user.id },
        orderBy: { startTime: 'desc' }
      })

      // Get total entries count
      const totalEntries = await prisma.timeEntry.count({
        where: { userId: user.id }
      })

      const todayMinutes = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
      const weekMinutes = weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)

      // Determine if user has issues
      const hasNoRecentEntries = !lastEntry || lastEntry.startTime < yesterday
      const hasLowWeeklyHours = weekMinutes < (40 * 60) // Less than 40 hours
      const hasNoTodayTime = todayMinutes === 0
      const hasIssues = hasNoRecentEntries || hasLowWeeklyHours || (hasNoTodayTime && new Date().getHours() > 10)

      return {
        user,
        todayMinutes,
        weekMinutes,
        lastEntryDate: lastEntry?.startTime.toISOString() || null,
        entriesCount: totalEntries,
        hasIssues
      }
    })

    const userData = await Promise.all(userDataPromises)

    return NextResponse.json(userData)
  } catch (error) {
    console.error('Error fetching user oversight data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}