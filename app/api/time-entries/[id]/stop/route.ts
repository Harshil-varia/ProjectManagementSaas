import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(NEXT_AUTH_CONFIG)
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Await params before using its properties
    const { id } = await params
    
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id }
    })

    if (!timeEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    if (timeEntry.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (timeEntry.endTime) {
      return NextResponse.json(
        { error: 'Time entry already stopped' },
        { status: 400 }
      )
    }

    const endTime = new Date()
    const duration = Math.floor((endTime.getTime() - timeEntry.startTime.getTime()) / 60000) // in minutes

    const updatedEntry = await prisma.timeEntry.update({
      where: { id },
      data: {
        endTime,
        duration
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

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Error stopping time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}