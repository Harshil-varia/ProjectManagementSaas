import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(NEXT_AUTH_CONFIG)
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { projectId, description, startTime, endTime, duration } = await request.json()

    const startDateTime = new Date(startTime)
    const endDateTime = new Date(endTime)

    // Calculate hours from duration (duration is in minutes) as Decimal
    const hours = duration / 60

    // Extract date from startTime (normalized to start of day)
    const date = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate())

    const timeEntry = await prisma.timeEntry.create({
      data: {
        userId: session.user.id,
        projectId,
        description: description || null,
        startTime: startDateTime,
        endTime: endDateTime,
        duration,
        hours, // Prisma will convert to Decimal automatically
        date // Add the missing date field
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    })

    return NextResponse.json(timeEntry)
  } catch (error) {
    console.error('Error creating manual time entry:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}