// lib/spending-calculator.ts
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

// ✅ FIXED: Safe decimal conversion helper
function safeDecimalToNumber(decimal: Decimal | number | null | undefined): number {
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

// Helper function to determine quarter based on custom fiscal year (Apr-Mar)
function getFiscalQuarter(date: Date): 1 | 2 | 3 | 4 {
  // ✅ FIXED: Add validation for date input
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to getFiscalQuarter')
  }

  const month = date.getMonth() + 1 // 1-12
  if (month >= 4 && month <= 6) return 1  // Q1: Apr-Jun
  if (month >= 7 && month <= 9) return 2  // Q2: Jul-Sep
  if (month >= 10 && month <= 12) return 3 // Q3: Oct-Dec
  return 4 // Q4: Jan-Mar
}

export class SpendingCalculator {
  /**
   * Recalculate and update project spending for a specific project
   */
  static async updateProjectSpending(projectId: string): Promise<void> {
    // ✅ FIXED: Add input validation
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID provided')
    }

    try {
      // Get all time entries for this project with user rates
      const timeEntries = await prisma.timeEntry.findMany({
        where: { projectId },
        include: {
          user: {
            select: {
              employeeRate: true
            }
          }
        }
      })

      // ✅ FIXED: Initialize quarterly spending as Prisma Decimals
      let q1Spent = new Decimal(0)
      let q2Spent = new Decimal(0)
      let q3Spent = new Decimal(0)
      let q4Spent = new Decimal(0)

      // Calculate spending for each entry
      timeEntries.forEach(entry => {
        try {
          // ✅ FIXED: Validate entry data
          if (!entry.date || !entry.hours || !entry.user?.employeeRate) {
            console.warn('Invalid time entry data:', entry.id)
            return
          }

          const entryDate = new Date(entry.date)
          const quarter = getFiscalQuarter(entryDate)
          
          // ✅ FIXED: Safe decimal operations
          const hours = safeDecimalToNumber(entry.hours)
          const rate = safeDecimalToNumber(entry.user.employeeRate)
          
          if (hours <= 0 || rate < 0) {
            console.warn('Invalid hours or rate for entry:', entry.id)
            return
          }

          const cost = new Decimal(hours).mul(new Decimal(rate))

          switch (quarter) {
            case 1: q1Spent = q1Spent.add(cost); break
            case 2: q2Spent = q2Spent.add(cost); break
            case 3: q3Spent = q3Spent.add(cost); break
            case 4: q4Spent = q4Spent.add(cost); break
          }
        } catch (error) {
          console.warn('Error processing time entry:', entry.id, error)
        }
      })

      // ✅ FIXED: Update project with Prisma Decimals
      await prisma.project.update({
        where: { id: projectId },
        data: {
          q1Spent,
          q2Spent,
          q3Spent,
          q4Spent
        }
      })

      console.log(`Updated spending for project ${projectId}:`, {
        q1Spent: q1Spent.toFixed(2),
        q2Spent: q2Spent.toFixed(2),
        q3Spent: q3Spent.toFixed(2),
        q4Spent: q4Spent.toFixed(2)
      })

    } catch (error) {
      console.error('Failed to update project spending:', error)
      throw error
    }
  }

  /**
   * Calculate spending for a single time entry
   */
  static async calculateEntrySpending(
    hours: number, 
    userId: string, 
    entryDate: Date
  ): Promise<{
    cost: number;
    quarter: 1 | 2 | 3 | 4;
    quarterKey: string;
  }> {
    // ✅ FIXED: Add input validation
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided')
    }

    if (!entryDate || !(entryDate instanceof Date) || isNaN(entryDate.getTime())) {
      throw new Error('Invalid date provided')
    }

    if (typeof hours !== 'number' || isNaN(hours) || hours < 0) {
      throw new Error('Invalid hours provided')
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { employeeRate: true }
    })

    if (!user) {
      console.error(`User with ID ${userId} not found`)
      throw new Error('User not found')
    }

    // ✅ FIXED: Safe decimal conversion and calculation
    const rate = safeDecimalToNumber(user.employeeRate)
    const cost = hours * rate
    const quarter = getFiscalQuarter(entryDate)
    const quarterKey = `q${quarter}Spent` as const

    // ✅ FIXED: Validate calculated cost
    if (!isFinite(cost)) {
      throw new Error('Invalid cost calculation')
    }

    return {
      cost,
      quarter,
      quarterKey
    }
  }

  /**
   * Recalculate spending for all projects (useful for data migration/cleanup)
   */
  static async recalculateAllProjectSpending(): Promise<void> {
    try {
      const projects = await prisma.project.findMany({
        select: { id: true, name: true }
      })

      console.log(`Recalculating spending for ${projects.length} projects...`)

      // ✅ FIXED: Process projects in batches to avoid memory issues
      const batchSize = 10
      for (let i = 0; i < projects.length; i += batchSize) {
        const batch = projects.slice(i, i + batchSize)
        
        await Promise.all(
          batch.map(async (project) => {
            try {
              await this.updateProjectSpending(project.id)
              console.log(`✅ Updated ${project.name}`)
            } catch (error) {
              console.error(`❌ Failed to update ${project.name}:`, error)
            }
          })
        )
      }

      console.log('✅ All project spending updated successfully')
    } catch (error) {
      console.error('Failed to recalculate all project spending:', error)
      throw error
    }
  }

  /**
   * Get current spending breakdown for a project
   */
  static async getProjectSpendingBreakdown(projectId: string): Promise<{
    quarterly: { q1: number; q2: number; q3: number; q4: number };
    total: number;
    entries: number;
    employees: number;
  }> {
    // ✅ FIXED: Add input validation
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID provided')
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true,
        _count: {
          select: {
            timeEntries: true,
            projectUsers: true
          }
        }
      }
    })

    if (!project) {
      throw new Error('Project not found')
    }

    // ✅ FIXED: Safe decimal to number conversion
    const quarterly = {
      q1: safeDecimalToNumber(project.q1Spent),
      q2: safeDecimalToNumber(project.q2Spent),
      q3: safeDecimalToNumber(project.q3Spent),
      q4: safeDecimalToNumber(project.q4Spent)
    }

    const total = Object.values(quarterly).reduce((sum, spent) => sum + spent, 0)

    return {
      quarterly,
      total,
      entries: project._count.timeEntries,
      employees: project._count.projectUsers
    }
  }

  /**
   * Check if project is over budget in any quarter
   */
  static async checkBudgetStatus(projectId: string): Promise<{
    isOverBudget: boolean;
    overBudgetQuarters: string[];
    utilizationRates: Record<string, number>;
    totalUtilization: number;
  }> {
    // ✅ FIXED: Add input validation
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID provided')
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        q1Budget: true,
        q2Budget: true,
        q3Budget: true,
        q4Budget: true,
        totalBudget: true,
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true
      }
    })

    if (!project) {
      throw new Error('Project not found')
    }

    const quarters = ['q1', 'q2', 'q3', 'q4'] as const
    const overBudgetQuarters: string[] = []
    const utilizationRates: Record<string, number> = {}

    quarters.forEach(quarter => {
      // ✅ FIXED: Safe decimal conversion
      const budget = safeDecimalToNumber(project[`${quarter}Budget`])
      const spent = safeDecimalToNumber(project[`${quarter}Spent`])
      
      if (budget > 0) {
        const utilization = (spent / budget) * 100
        // ✅ FIXED: Ensure utilization is finite
        utilizationRates[quarter] = isFinite(utilization) ? utilization : 0
        
        if (spent > budget) {
          overBudgetQuarters.push(quarter.toUpperCase())
        }
      } else {
        utilizationRates[quarter] = 0
      }
    })

    // ✅ FIXED: Safe total calculations
    const totalBudget = safeDecimalToNumber(project.totalBudget)
    const totalSpent = quarters.reduce((sum, quarter) => 
      sum + safeDecimalToNumber(project[`${quarter}Spent`]), 0
    )
    
    const totalUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

    return {
      isOverBudget: overBudgetQuarters.length > 0 || totalSpent > totalBudget,
      overBudgetQuarters,
      utilizationRates,
      totalUtilization: isFinite(totalUtilization) ? totalUtilization : 0
    }
  }

  /**
   * Get spending alerts for projects that need attention
   */
  static async getSpendingAlerts(): Promise<Array<{
    projectId: string;
    projectName: string;
    alertType: 'warning' | 'critical' | 'over-budget';
    quarter: string;
    utilization: number;
    budget: number;
    spent: number;
  }>> {
    try {
      const projects = await prisma.project.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          q1Budget: true,
          q2Budget: true,
          q3Budget: true,
          q4Budget: true,
          q1Spent: true,
          q2Spent: true,
          q3Spent: true,
          q4Spent: true
        }
      })

      const alerts: any[] = []
      const quarters = ['q1', 'q2', 'q3', 'q4'] as const

      projects.forEach(project => {
        // ✅ FIXED: Add project validation
        if (!project.id || !project.name) {
          console.warn('Invalid project data:', project)
          return
        }

        quarters.forEach(quarter => {
          try {
            // ✅ FIXED: Safe decimal conversion
            const budget = safeDecimalToNumber(project[`${quarter}Budget`])
            const spent = safeDecimalToNumber(project[`${quarter}Spent`])

            if (budget === 0) return // Skip quarters with no budget

            const utilization = (spent / budget) * 100

            // ✅ FIXED: Validate utilization calculation
            if (!isFinite(utilization) || utilization < 0) {
              console.warn(`Invalid utilization for project ${project.name}, ${quarter}:`, utilization)
              return
            }

            let alertType: 'warning' | 'critical' | 'over-budget' | null = null

            if (utilization >= 100) {
              alertType = 'over-budget'
            } else if (utilization >= 90) {
              alertType = 'critical'
            } else if (utilization >= 75) {
              alertType = 'warning'
            }

            if (alertType) {
              alerts.push({
                projectId: project.id,
                projectName: project.name,
                alertType,
                quarter: quarter.toUpperCase(),
                utilization: Math.round(utilization * 100) / 100, // Round to 2 decimal places
                budget,
                spent
              })
            }
          } catch (error) {
            console.warn(`Error processing alert for project ${project.name}, ${quarter}:`, error)
          }
        })
      })

      // Sort by severity and utilization
      return alerts.sort((a, b) => {
        const severityOrder: { [key: string]: number } = { 'over-budget': 3, 'critical': 2, 'warning': 1 }
        const aSeverity = severityOrder[a.alertType as keyof typeof severityOrder] || 0
        const bSeverity = severityOrder[b.alertType as keyof typeof severityOrder] || 0
        
        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity
        }
        
        return b.utilization - a.utilization
      })
    } catch (error) {
      console.error('Failed to get spending alerts:', error)
      return [] // Return empty array instead of throwing
    }
  }

  /**
   * ✅ NEW: Get safe spending summary for a project
   */
  static async getProjectSpendingSummary(projectId: string): Promise<{
    totalBudget: string;
    totalSpent: string;
    totalRemaining: string;
    utilizationPercent: number;
    quarterlyBreakdown: Array<{
      quarter: string;
      budget: string;
      spent: string;
      remaining: string;
      utilization: number;
    }>;
  }> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID provided')
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        totalBudget: true,
        q1Budget: true,
        q2Budget: true,
        q3Budget: true,
        q4Budget: true,
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true
      }
    })

    if (!project) {
      throw new Error('Project not found')
    }

    const quarters = [
      { key: 'q1', label: 'Q1 (Apr-Jun)' },
      { key: 'q2', label: 'Q2 (Jul-Sep)' },
      { key: 'q3', label: 'Q3 (Oct-Dec)' },
      { key: 'q4', label: 'Q4 (Jan-Mar)' }
    ]

    const totalBudget = safeDecimalToNumber(project.totalBudget)
    const totalSpent = quarters.reduce((sum, { key }) => 
      sum + safeDecimalToNumber(project[`${key}Spent` as keyof typeof project]), 0
    )
    const totalRemaining = Math.max(0, totalBudget - totalSpent)
    const utilizationPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

    const quarterlyBreakdown = quarters.map(({ key, label }) => {
      const budget = safeDecimalToNumber(project[`${key}Budget` as keyof typeof project])
      const spent = safeDecimalToNumber(project[`${key}Spent` as keyof typeof project])
      const remaining = Math.max(0, budget - spent)
      const utilization = budget > 0 ? (spent / budget) * 100 : 0

      return {
        quarter: label,
        budget: budget.toFixed(2),
        spent: spent.toFixed(2),
        remaining: remaining.toFixed(2),
        utilization: Math.round(utilization * 100) / 100
      }
    })

    return {
      totalBudget: totalBudget.toFixed(2),
      totalSpent: totalSpent.toFixed(2),
      totalRemaining: totalRemaining.toFixed(2),
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      quarterlyBreakdown
    }
  }
}