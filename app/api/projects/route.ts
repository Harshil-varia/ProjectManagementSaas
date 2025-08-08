// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

// Helper function for error handling
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

// ✅ FIXED: Safe helper function to convert Decimal to number for JSON serialization
const safeDecimalToNumber = (decimal: Decimal | number | null | undefined): number => {
  if (typeof decimal === 'number') {
    return isFinite(decimal) ? decimal : 0
  }
  
  if (!decimal) return 0
  
  try {
    // Use toNumber() method instead of parseFloat(toString())
    const number = decimal.toNumber()
    
    // Validate the result is within safe JavaScript integer range
    if (!Number.isFinite(number)) {
      console.warn('Decimal value is not finite:', decimal.toString())
      return parseFloat(decimal.toFixed(2))
    }
    
    if (Math.abs(number) > Number.MAX_SAFE_INTEGER) {
      console.warn('Number exceeds safe integer range:', number)
      return parseFloat(decimal.toFixed(2))
    }
    
    return number
  } catch (error) {
    console.error('Decimal conversion error:', error)
    return parseFloat(decimal.toFixed(2))
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeBudget = searchParams.get('include') === 'budget' || searchParams.get('budget') === 'true'
    const detailed = searchParams.get('detailed') === 'true'
    const debug = searchParams.get('debug') === 'true'

    console.log('Fetching projects with options:', { includeBudget, detailed, debug })

    // ✅ SOLUTION 1: Use separate queries to avoid type conflicts
    if (detailed) {
      // Detailed query with all relations
      const detailedProjects = await prisma.project.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          color: true,
          active: true,
          description: true,
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
          projectUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeRate: true
                }
              }
            }
          },
          timeEntries: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeRate: true
                }
              }
            },
            orderBy: {
              date: 'desc'
            }
          }
        },
        orderBy: [{ name: 'asc' }]
      })

      const formattedProjects = detailedProjects.map(project => ({
        id: project.id,
        name: project.name,
        color: project.color,
        active: project.active,
        description: project.description,
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
      }))

      return NextResponse.json(formattedProjects)
    }

    // ✅ SOLUTION 2: Admin query with project users
    if (session.user?.role === 'ADMIN') {
      const adminProjects = await prisma.project.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
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
          projectUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeRate: true
                }
              }
            }
          }
        },
        orderBy: [{ name: 'asc' }]
      })

      const formattedProjects = adminProjects.map(project => ({
        id: project.id,
        name: project.name,
        color: project.color,
        active: project.active,
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
        }))
      }))

      return NextResponse.json(formattedProjects)
    }

    // ✅ SOLUTION 3: Basic query for regular users
    const basicProjects = await prisma.project.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
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
      },
      orderBy: [{ name: 'asc' }]
    })

    const formattedProjects = basicProjects.map(project => ({
      id: project.id,
      name: project.name,
      color: project.color,
      active: project.active,
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
      updatedAt: project.updatedAt
    }))

    if (debug) {
      console.log('Debug: Projects API Response:', {
        totalProjects: formattedProjects.length,
        sampleProject: formattedProjects[0],
        options: { includeBudget, detailed },
        budgetFieldsIncluded: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`Projects API: Returned ${formattedProjects.length} projects (includeBudget: ${includeBudget}, detailed: ${detailed})`)

    return NextResponse.json(formattedProjects)

  } catch (error) {
    console.error('Failed to fetch projects:', getErrorMessage(error))
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : 'An error occurred' 
    }, { status: 500 })
  }
}