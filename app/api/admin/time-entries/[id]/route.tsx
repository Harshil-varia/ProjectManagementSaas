// app/api/admin/time-entries/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SpendingCalculator } from '@/lib/spending-calculator'
import { z } from 'zod'

const updateAdminTimeEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectId: z.string().nullable(),
  description: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable(),
  duration: z.number().min(0).optional(),
  date: z.string().optional() // Add date field
})

const deleteAdminTimeEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required")
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error
    const session = authCheck.session!

    const { id: entryId } = await params

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })
    }

    const body = await request.json()
    const result = updateAdminTimeEntrySchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: result.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    // Get existing entry to check if it exists and get old project ID
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        projectId: true
      }
    })

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    const { userId, projectId, description, startTime, endTime, duration, date } = result.data

    // Verify the target user exists and matches
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Verify this entry belongs to the specified user
    if (existingEntry.userId !== userId) {
      return NextResponse.json({ 
        error: 'Entry does not belong to specified user' 
      }, { status: 400 })
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

    console.log(`Admin ${session.user.email} updating time entry ${entryId} for user ${targetUser.email}`)

    // Build update data
    const updateData: any = {}
    
    if (projectId !== undefined) updateData.projectId = projectId
    if (description !== undefined) updateData.description = description || null
    
    // Handle date and startTime properly
    if (date !== undefined) {
      // If date is provided, use it as the base date (force local timezone)
      const entryDate = new Date(date + 'T00:00:00')
      updateData.date = entryDate
      
      // If startTime is also provided, combine date + startTime
      if (startTime !== undefined) {
        const [hours, minutes] = startTime.split(':').map(Number)
        const startDateTime = new Date(entryDate)
        startDateTime.setHours(hours, minutes, 0, 0)
        updateData.startTime = startDateTime
      }
    } else if (startTime !== undefined) {
      // If only startTime is provided (backward compatibility)
      updateData.startTime = new Date(startTime)
      // Update date based on new start time
      const startDateTime = new Date(startTime)
      updateData.date = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate())
    }
    
    // Handle endTime
    if (endTime !== undefined) {
      if (endTime && date !== undefined) {
        // Combine the selected date with the end time
        const [hours, minutes] = endTime.split(':').map(Number)
        const endDateTime = new Date(date + 'T00:00:00') // Force local timezone
        endDateTime.setHours(hours, minutes, 0, 0)
        updateData.endTime = endDateTime
      } else if (endTime) {
        updateData.endTime = new Date(endTime)
      } else {
        updateData.endTime = null
      }
    }
    
    if (duration !== undefined) {
      updateData.duration = duration
      updateData.hours = duration / 60 // Convert minutes to hours
    }

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

    // Update spending for affected projects
    const projectsToUpdate = new Set<string>()
    if (existingEntry.projectId) projectsToUpdate.add(existingEntry.projectId)
    if (projectId && projectId !== existingEntry.projectId) projectsToUpdate.add(projectId)

    for (const pId of projectsToUpdate) {
      try {
        await SpendingCalculator.updateProjectSpending(pId)
        console.log(`✅ Updated spending for project ${pId} after admin time entry update`)
      } catch (spendingError) {
        console.error(`Failed to update spending for project ${pId}:`, spendingError)
      }
    }

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Failed to update admin time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error
    const session = authCheck.session!

    const { id: entryId } = await params

    if (!entryId) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })
    }

    // Parse request body for user validation
    let body = {}
    try {
      const requestText = await request.text()
      if (requestText) {
        body = JSON.parse(requestText)
      }
    } catch (e) {
      // Body might be empty, which is okay
    }

    const bodyResult = deleteAdminTimeEntrySchema.safeParse(body)
    if (!bodyResult.success) {
      return NextResponse.json({ 
        error: 'Validation failed - userId required in request body', 
        details: bodyResult.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    const { userId } = bodyResult.data

    // Get existing entry to check if it exists and get project ID
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        projectId: true
      }
    })

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }

    // Verify this entry belongs to the specified user
    if (existingEntry.userId !== userId) {
      return NextResponse.json({ 
        error: 'Entry does not belong to specified user' 
      }, { status: 400 })
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    console.log(`Admin ${session.user.email} deleting time entry ${entryId} for user ${targetUser.email}`)

    // Delete the time entry
    await prisma.timeEntry.delete({
      where: { id: entryId }
    })

    // Update project spending if there was a project
    if (existingEntry.projectId) {
      try {
        await SpendingCalculator.updateProjectSpending(existingEntry.projectId)
        console.log(`✅ Updated spending for project ${existingEntry.projectId} after admin time entry deletion`)
      } catch (spendingError) {
        console.error('Failed to update project spending:', spendingError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete admin time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}