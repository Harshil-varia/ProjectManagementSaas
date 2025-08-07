// app/api/time-entries/route.ts (Enhanced version)
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SpendingCalculator } from '@/lib/spending-calculator'
import { z } from 'zod'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'

const createTimeEntrySchema = z.object({
  projectId: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  duration: z.number().min(0).optional(),
  hours: z.number().min(0),
  date: z.string()
})

const updateTimeEntrySchema = z.object({
  projectId: z.string().min(1).optional(),
  description: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.number().min(0).optional(),
  hours: z.number().min(0).optional(),
  date: z.string().optional()
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const whereClause: any = {
      userId: session.user.id
    }

    if (projectId) {
      whereClause.projectId = projectId
    }

    if (startDate && endDate) {
      whereClause.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: whereClause,
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
        date: 'desc'
      }
    })

    return NextResponse.json(timeEntries)
  } catch (error) {
    console.error('Failed to fetch time entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = createTimeEntrySchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: result.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    const { projectId, description, startTime, endTime, duration, hours, date } = result.data

    // Check if user has access to this project
    const projectAccess = await prisma.projectUser.findFirst({
      where: {
        userId: session.user.id,
        projectId
      }
    })

    if (!projectAccess && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'No access to this project' }, { status: 403 })
    }

    // Create the time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        userId: session.user.id,
        projectId,
        description,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        duration,
        hours,
        date: new Date(date)
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

    // Automatically update project spending
    try {
      await EnhancedSpendingCalculator.updateProjectSpendingWithHistory(projectId)
      console.log(`✅ Updated spending for project ${projectId} after new time entry`)
    } catch (spendingError) {
      console.error('Failed to update project spending:', spendingError)
      // Don't fail the request if spending update fails
    }

    return NextResponse.json(timeEntry, { status: 201 })
  } catch (error) {
    console.error('Failed to create time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entryId = searchParams.get('id')

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })
    }

    const body = await request.json()
    const result = updateTimeEntrySchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: result.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    // Get existing entry to check ownership and get old project ID
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: {
        userId: true,
        projectId: true
      }
    })

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Check ownership (only user can edit their own entries, or admin)
    if (existingEntry.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateData: any = {}
    const { projectId, description, startTime, endTime, duration, hours, date } = result.data

    if (projectId !== undefined) {
      // Check access to new project if changing
      const projectAccess = await prisma.projectUser.findFirst({
        where: {
          userId: session.user.id,
          projectId
        }
      })

      if (!projectAccess && session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'No access to this project' }, { status: 403 })
      }

      updateData.projectId = projectId
    }

    if (description !== undefined) updateData.description = description
    if (startTime !== undefined) updateData.startTime = new Date(startTime)
    if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null
    if (duration !== undefined) updateData.duration = duration
    if (hours !== undefined) updateData.hours = hours
    if (date !== undefined) updateData.date = new Date(date)

    // Update the time entry
    const updatedEntry = await prisma.timeEntry.update({
      where: { id: entryId },
      data: updateData,
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

    // Update spending for affected projects
    const projectsToUpdate = new Set([existingEntry.projectId])
    if (projectId && projectId !== existingEntry.projectId) {
      projectsToUpdate.add(projectId)
    }

    for (const pId of projectsToUpdate) {
      try {
        await SpendingCalculator.updateProjectSpending(pId)
        console.log(`✅ Updated spending for project ${pId} after time entry update`)
      } catch (spendingError) {
        console.error(`Failed to update spending for project ${pId}:`, spendingError)
      }
    }

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Failed to update time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entryId = searchParams.get('id')

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })
    }

    // Get existing entry to check ownership and get project ID
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: {
        userId: true,
        projectId: true
      }
    })

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Check ownership (only user can delete their own entries, or admin)
    if (existingEntry.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete the time entry
    await prisma.timeEntry.delete({
      where: { id: entryId }
    })

    // Update project spending
    try {
      await SpendingCalculator.updateProjectSpending(existingEntry.projectId)
      console.log(`✅ Updated spending for project ${existingEntry.projectId} after time entry deletion`)
    } catch (spendingError) {
      console.error('Failed to update project spending:', spendingError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}