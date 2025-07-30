// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// ✅ FIXED: Safe helper function to convert Decimal to number for JSON serialization
const safeDecimalToNumber = (decimal: Prisma.Decimal | number | null | undefined): number => {
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

    // ✅ FIXED: Enhanced query based on the detailed report pattern
    const projects = await prisma.project.findMany({
      where: { 
        active: true 
      },
      select: {
        id: true,
        name: true,
        color: true,
        active: true,
        // ✅ ALWAYS include budget fields when requested
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
        // ✅ Include additional data for detailed requests
        ...(detailed && {
          description: true,
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
            },
            take: detailed ? undefined : 0 // Include all time entries if detailed
          }
        }),
        // Include related data for admin users
        ...(session.user.role === 'ADMIN' && !detailed && {
          projectUsers: {
            select: {
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        })
      },
      orderBy: [
        { name: 'asc' }
      ]
    })

    // ✅ FIXED: Safe conversion of all decimal fields with enhanced error handling
    const formattedProjects = projects.map(project => {
      try {
        const formattedProject = {
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
          // ✅ Include additional fields for detailed requests
          ...(detailed && {
            description: project.description,
            projectUsers: project.projectUsers?.map(pu => ({
              userId: pu.user.id,
              name: pu.user.name,
              email: pu.user.email,
              rate: safeDecimalToNumber(pu.user.employeeRate)
            })) || [],
            timeEntries: project.timeEntries?.map(te => ({
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
            })) || []
          }),
          projectUsers: project.projectUsers || undefined
        }

        return formattedProject
      } catch (error) {
        console.error(`Error formatting project ${project.id}:`, error)
        // Return a safe fallback
        return {
          id: project.id,
          name: project.name || 'Unknown Project',
          color: project.color || '#000000',
          active: project.active !== false,
          totalBudget: 0,
          q1Budget: 0,
          q2Budget: 0,
          q3Budget: 0,
          q4Budget: 0,
          q1Spent: 0,
          q2Spent: 0,
          q3Spent: 0,
          q4Spent: 0,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      }
    })

    if (debug) {
      console.log('Debug: Projects API Response:', {
        totalProjects: formattedProjects.length,
        sampleProject: formattedProjects[0],
        options: { includeBudget, detailed },
        budgetFieldsIncluded: true,
        timestamp: new Date().toISOString()
      })
    }

    // ✅ Log summary for monitoring
    console.log(`Projects API: Returned ${formattedProjects.length} projects (includeBudget: ${includeBudget}, detailed: ${detailed})`)

    return NextResponse.json(formattedProjects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred' 
    }, { status: 500 })
  }
}