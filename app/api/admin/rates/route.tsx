import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateRateSchema = z.object({
  userId: z.string(),
  rate: z.number().min(0),
  effectiveDate: z.string().optional()
})

export async function GET() {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        employeeRate: true,
        rateHistory: {
          orderBy: { effectiveDate: 'desc' },
          take: 5,
          select: {
            id: true,
            rate: true,
            effectiveDate: true,
            createdAt: true,
            createdBy: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Failed to fetch rates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, rate, effectiveDate } = updateRateSchema.parse(body)

    // Update user's current rate
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { employeeRate: rate }
    })

    // Create rate history entry
    await prisma.rateHistory.create({
      data: {
        userId,
        rate,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        createdBy: session.user.id
      }
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Failed to update rate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}