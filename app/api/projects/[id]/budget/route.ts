// app/api/projects/[id]/budget/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

// Helper function to convert Decimal to number for JSON serialization
const decimalToNumber = (decimal: Decimal): number => {
  return parseFloat(decimal.toString())
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active projects with budget information
    const projects = await prisma.project.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        active: true,
        totalBudget: true,
        q1Budget: true,
        q2Budget: true,
        q3Budget: true,
        q4Budget: true,
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            timeEntries: true,
            projectUsers: true
          }
        }
      },
      orderBy: [
        { name: 'asc' }
      ]
    })

    // Convert Decimal fields to numbers for JSON response
    const formattedProjects = projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      active: project.active,
      totalBudget: decimalToNumber(project.totalBudget),
      q1Budget: decimalToNumber(project.q1Budget),
      q2Budget: decimalToNumber(project.q2Budget),
      q3Budget: decimalToNumber(project.q3Budget),
      q4Budget: decimalToNumber(project.q4Budget),
      q1Spent: decimalToNumber(project.q1Spent),
      q2Spent: decimalToNumber(project.q2Spent),
      q3Spent: decimalToNumber(project.q3Spent),
      q4Spent: decimalToNumber(project.q4Spent),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      metrics: {
        totalTimeEntries: project._count.timeEntries,
        totalUsers: project._count.projectUsers
      }
    }))

    return NextResponse.json(formattedProjects)

  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new project (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, color } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    // Check if project name already exists
    const existingProject = await prisma.project.findFirst({
      where: { 
        name: name.trim(),
        active: true
      }
    })

    if (existingProject) {
      return NextResponse.json({ 
        error: 'A project with this name already exists' 
      }, { status: 400 })
    }

    // Create new project
    const newProject = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#3b82f6',
        // Budget fields default to 0 via schema defaults
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        active: true,
        totalBudget: true,
        q1Budget: true,
        q2Budget: true,
        q3Budget: true,
        q4Budget: true,
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // Convert Decimals to numbers for response
    const formattedProject = {
      id: newProject.id,
      name: newProject.name,
      description: newProject.description,
      color: newProject.color,
      active: newProject.active,
      totalBudget: decimalToNumber(newProject.totalBudget),
      q1Budget: decimalToNumber(newProject.q1Budget),
      q2Budget: decimalToNumber(newProject.q2Budget),
      q3Budget: decimalToNumber(newProject.q3Budget),
      q4Budget: decimalToNumber(newProject.q4Budget),
      q1Spent: decimalToNumber(newProject.q1Spent),
      q2Spent: decimalToNumber(newProject.q2Spent),
      q3Spent: decimalToNumber(newProject.q3Spent),
      q4Spent: decimalToNumber(newProject.q4Spent),
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt
    }

    console.log(`New project created: ${name} by admin: ${session.user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Project created successfully',
      project: formattedProject
    })

  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}