// app/api/admin/time-entries/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EnhancedSpendingCalculator} from '@/lib/spending-calculator-enhanced'
import { z } from 'zod'

const createAdminTimeEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectId: z.string().nullable(),
  description: z.string().optional(),
  startTime: z.string(), // Just the time (HH:MM)
  endTime: z.string().nullable(), // Just the time (HH:MM)
  duration: z.number().min(0),
  date: z.string() // The date (YYYY-MM-DD)
})

const updateAdminTimeEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectId: z.string().nullable(),
  description: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable(),
  duration: z.number().min(0).optional()
})

// Helper function to check admin authorization
async function checkAdminAuth() {
  const session = await getServerSession(NEXT_AUTH_CONFIG)
  
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  
  if (session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) }
  }
  
  return { session }
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error
    const session = authCheck.session!

    const body = await request.json()
    const result = createAdminTimeEntrySchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: result.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    const { userId, projectId, description, startTime, endTime, duration, date } = result.data

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Verify project exists if provided
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true }
      })

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
    }

    console.log(`Admin ${session.user.email} creating time entry for user ${targetUser.email}`)

    // Parse the date and times
    const entryDate = new Date(date + 'T00:00:00') // Force local timezone
    
    // Create start datetime by combining date + startTime
    const [startHours, startMinutes] = startTime.split(':').map(Number)
    const startDateTime = new Date(entryDate)
    startDateTime.setHours(startHours, startMinutes, 0, 0)
    
    // Create end datetime by combining date + endTime (if provided)
    let endDateTime = null
    if (endTime) {
      const [endHours, endMinutes] = endTime.split(':').map(Number)
      endDateTime = new Date(entryDate)
      endDateTime.setHours(endHours, endMinutes, 0, 0)
    }

    // Create the time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        userId: userId,
        projectId: projectId,
        description: description || null,
        startTime: startDateTime,
        endTime: endDateTime,
        duration: duration,
        hours: duration / 60, // Convert minutes to hours
        date: entryDate
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
            email: true,
            name: true
          }
        }
      }
    })

    // Update project spending if project is assigned
    if (projectId) {
      try {
        await EnhancedSpendingCalculator.updateProjectSpendingWithHistory(projectId)
        console.log(`✅ Updated spending for project ${projectId} after admin time entry creation`)
      } catch (spendingError) {
        console.error('Failed to update project spending:', spendingError)
        // Don't fail the request if spending update fails
      }
    }

    return NextResponse.json(timeEntry, { status: 201 })
  } catch (error) {
    console.error('Failed to create admin time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}