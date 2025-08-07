// app/api/admin/rates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'
import { z } from 'zod'

const updateRateSchema = z.object({
  userId: z.string(),
  rate: z.number().min(0, "Rate must be non-negative"),
  effectiveDate: z.string().transform(str => new Date(str)),
  reason: z.string().optional()
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

// GET - Get all users with their rate history
export async function GET(request: NextRequest) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error

    console.log('Fetching users with rate history...')

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        employeeRate: true,
        createdAt: true,
        rateHistory: {
          orderBy: {
            effectiveDate: 'desc'
          },
          take: 5 // Get recent rate changes
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Format the response
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeRate: Number(user.employeeRate),
      createdAt: user.createdAt,
      rateHistory: user.rateHistory.map(rh => ({
        id: rh.id,
        rate: Number(rh.rate),
        effectiveDate: rh.effectiveDate.toISOString(),
        createdAt: rh.createdAt.toISOString(),
        createdBy: rh.createdBy
      }))
    }))

    console.log(`Fetched ${formattedUsers.length} users with rate history`)

    return NextResponse.json(formattedUsers)

  } catch (error) {
    console.error('Failed to get users with rate history:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update user rate using the enhanced calculator
export async function PUT(request: NextRequest) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error
    const session = authCheck.session!

    const body = await request.json()
    const result = updateRateSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      }, { status: 400 })
    }

    const { userId, rate, effectiveDate, reason } = result.data

    console.log(`Admin ${session.user.email} updating rate for user ${userId} to ${rate} effective ${effectiveDate.toISOString()}`)

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, employeeRate: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if there's already a rate change for this exact date
    const existingRateChange = await prisma.rateHistory.findFirst({
      where: {
        userId,
        effectiveDate: effectiveDate
      }
    })

    if (existingRateChange) {
      return NextResponse.json({
        error: 'A rate change already exists for this date. Please choose a different date or update the existing rate change.'
      }, { status: 409 })
    }

    // Use the enhanced calculator to update the rate (handles rate history and recalculation)
    await EnhancedSpendingCalculator.updateUserRate(
      userId,
      rate,
      effectiveDate,
      session.user.id
    )

    console.log(`Successfully updated rate for user ${user.email} to ${rate} effective ${effectiveDate.toISOString()}`)

    // Get updated rate history to return
    const updatedHistory = await prisma.rateHistory.findMany({
      where: { userId },
      orderBy: { effectiveDate: 'desc' },
      take: 5 // Return recent changes
    })

    return NextResponse.json({
      success: true,
      message: `Rate updated successfully. New rate of $${rate}/hour will be effective from ${effectiveDate.toLocaleDateString()}. All project spending has been recalculated with historical rates.`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      rateChange: {
        rate,
        effectiveDate,
        reason,
        createdBy: session.user.email,
        affectsSpendingFrom: effectiveDate,
        recalculationStatus: 'completed'
      },
      recentHistory: updatedHistory.map(rh => ({
        id: rh.id,
        rate: Number(rh.rate),
        effectiveDate: rh.effectiveDate,
        createdAt: rh.createdAt,
        createdBy: rh.createdBy
      }))
    })

  } catch (error) {
    console.error('Failed to update user rate:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE - Delete a future rate change
export async function DELETE(request: NextRequest) {
  try {
    const authCheck = await checkAdminAuth()
    if (authCheck.error) return authCheck.error
    const session = authCheck.session!

    const { searchParams } = new URL(request.url)
    const historyId = searchParams.get('historyId')
    const userId = searchParams.get('userId')

    if (!historyId) {
      return NextResponse.json({ error: 'Rate history ID required' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Get the rate history entry
    const rateHistoryEntry = await prisma.rateHistory.findUnique({
      where: { id: historyId },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    })

    if (!rateHistoryEntry) {
      return NextResponse.json({ error: 'Rate history entry not found' }, { status: 404 })
    }

    if (rateHistoryEntry.userId !== userId) {
      return NextResponse.json({ error: 'Rate history entry does not belong to specified user' }, { status: 400 })
    }

    // Only allow deletion of future rate changes
    if (new Date(rateHistoryEntry.effectiveDate) <= new Date()) {
      return NextResponse.json({
        error: 'Cannot delete rate changes that have already taken effect'
      }, { status: 400 })
    }

    // Delete the rate history entry and recalculate project spending
    await prisma.$transaction(async (tx) => {
      await tx.rateHistory.delete({
        where: { id: historyId }
      })

      // Get affected projects and recalculate their spending
      const affectedProjects = await tx.projectUser.findMany({
        where: { userId },
        select: { projectId: true }
      })

      // Recalculate spending for affected projects
      for (const { projectId } of affectedProjects) {
        await EnhancedSpendingCalculator.updateProjectSpendingWithHistory(projectId)
      }
    })

    console.log(`Admin ${session.user.email} deleted future rate change for user ${rateHistoryEntry.user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Future rate change deleted successfully. Project spending has been recalculated.'
    })

  } catch (error) {
    console.error('Failed to delete rate change:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}