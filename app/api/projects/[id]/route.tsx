import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

// Helper to parse Decimal safely
const safeDecimalToNumber = (decimal: any): number => {
  if (typeof decimal === 'number') return decimal
  if (!decimal) return 0
  try {
    const num = decimal.toNumber?.() ?? parseFloat(decimal)
    return Number.isFinite(num) ? num : 0
  } catch {
    return 0
  }
}

// GET /api/projects/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise< { id: string } >}
) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const project = await prisma.project.findUnique({
      
      where: { id: projectId },
      include: {
        projectUsers: {
          include: {
            user: {
              select: { id: true, name: true, email: true, employeeRate: true }
            }
          }
        },
        timeEntries: {
          include: {
            user: {
              select: { id: true, name: true, email: true, employeeRate: true }
            }
          },
          orderBy: { date: 'desc' }
        }
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      color: project.color,
      active: project.active,
      code: project.code,
      totalBudget: safeDecimalToNumber(project.totalBudget),
      q1Budget: safeDecimalToNumber(project.q1Budget),
      q2Budget: safeDecimalToNumber(project.q2Budget),
      q3Budget: safeDecimalToNumber(project.q3Budget),
      q4Budget: safeDecimalToNumber(project.q4Budget),
      q1Spent: safeDecimalToNumber(project.q1Spent),
      q2Spent: safeDecimalToNumber(project.q2Spent),
      q3Spent: safeDecimalToNumber(project.q3Spent),
      q4Spent: safeDecimalToNumber(project.q4Spent),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      projectUsers: project.projectUsers.map(pu => ({
        userId: pu.user.id,
        name: pu.user.name,
        email: pu.user.email,
        rate: safeDecimalToNumber(pu.user.employeeRate)
      })),
      timeEntries: project.timeEntries.map(te => ({
        id: te.id,
        date: te.date,
        hours: safeDecimalToNumber(te.hours),
        description: te.description,
        user: {
          id: te.user.id,
          name: te.user.name,
          email: te.user.email,
          rate: safeDecimalToNumber(te.user.employeeRate)
        }
      }))
    })
  } catch (err) {
    console.error('Error fetching project:', getErrorMessage(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/projects/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }>}
) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, code, color, active } = body

    const updated = await prisma.project.update({
      where: { id: (await params).id },
      data: {
        name,
        code,
        color,
        active
      }
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Error updating project:', getErrorMessage(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }>}
) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await prisma.project.delete({
      where: { id: (await params).id }
    })

    return NextResponse.json({ message: 'Project deleted' })
  } catch (err) {
    console.error('Error deleting project:', getErrorMessage(err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}