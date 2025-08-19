// app/api/projects/summaries/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'

// Helper function to determine quarter based on custom fiscal year (Apr-Mar)
function getFiscalQuarter(date: Date): 1 | 2 | 3 | 4 {
  const month = date.getMonth() + 1 // 1-12
  if (month >= 4 && month <= 6) return 1  // Q1: Apr-Jun
  if (month >= 7 && month <= 9) return 2  // Q2: Jul-Sep
  if (month >= 10 && month <= 12) return 3 // Q3: Oct-Dec
  return 4 // Q4: Jan-Mar
}

export async function GET() {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Fetching project summaries with historical rate calculations...')

    // Get all projects with related data
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: {
            timeEntries: true,
            projectUsers: true
          }
        },
        timeEntries: {
          include: {
            user: {
              select: {
                id: true,
                employeeRate: true
              }
            }
          },
          orderBy: {
            date: 'desc'
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    console.log(`Processing ${projects.length} projects with historical rate calculations...`)

    // Process each project to calculate summaries with historical rates
    const projectSummaries = await Promise.all(projects.map(async (project) => {
      // Initialize quarterly spending tracking
      let q1Spent = 0
      let q2Spent = 0
      let q3Spent = 0
      let q4Spent = 0
      let totalHours = 0
      let totalSpentCalculated = 0
      const uniqueEmployees = new Set<string>()

      // Process all time entries with historical rates
      for (const entry of project.timeEntries) {
        const hours = Number(entry.hours) || 0
        const entryDate = new Date(entry.date)
        
        // Get historical rate for this specific entry
        const historicalRate = await EnhancedSpendingCalculator.getEffectiveRateForDate(
          entry.user.id,
          entryDate
        )
        
        const cost = hours * historicalRate
        const quarter = getFiscalQuarter(entryDate)
        
        // Add to quarterly totals
        switch (quarter) {
          case 1: q1Spent += cost; break
          case 2: q2Spent += cost; break
          case 3: q3Spent += cost; break
          case 4: q4Spent += cost; break
        }
        
        totalHours += hours
        totalSpentCalculated += cost
        uniqueEmployees.add(entry.userId)
      }

      // Update the project's spending in the database with the recalculated values
      try {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            q1Spent,
            q2Spent,
            q3Spent,
            q4Spent
          }
        })
      } catch (updateError) {
        console.warn(`Failed to update project ${project.id} spending:`, updateError)
      }

      // Budget calculations
      const totalBudget = Number(project.totalBudget)
      const budgetUtilization = totalBudget > 0 ? (totalSpentCalculated / totalBudget) * 100 : 0

      // Get last activity date
      const lastActivity = project.timeEntries.length > 0 ? project.timeEntries[0].date : null

      return {
        id: project.id,
        name: project.name,
        description: project.code,
        color: project.color,
        active: project.active,
        totalBudget,
        q1Budget: Number(project.q1Budget),
        q2Budget: Number(project.q2Budget),
        q3Budget: Number(project.q3Budget),
        q4Budget: Number(project.q4Budget),
        q1Spent, // Use recalculated values
        q2Spent, // Use recalculated values
        q3Spent, // Use recalculated values
        q4Spent, // Use recalculated values
        totalSpent: totalSpentCalculated, // Use recalculated total
        totalHours,
        employeeCount: uniqueEmployees.size,
        entryCount: project._count.timeEntries,
        budgetUtilization,
        lastActivity: lastActivity?.toISOString() || null
      }
    }))

    // Sort by budget utilization (most concerning first)
    projectSummaries.sort((a, b) => {
      // First sort by over-budget projects
      if (a.budgetUtilization >= 100 && b.budgetUtilization < 100) return -1
      if (b.budgetUtilization >= 100 && a.budgetUtilization < 100) return 1
      
      // Then by utilization descending
      return b.budgetUtilization - a.budgetUtilization
    })

    console.log(`Successfully processed ${projectSummaries.length} project summaries with historical rates`)

    return NextResponse.json({ projects: projectSummaries })
  } catch (error) {
    console.error('Failed to fetch project summaries:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}