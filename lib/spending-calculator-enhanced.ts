// lib/spending-calculator-enhanced.ts
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Safe decimal conversion helper
function safeDecimalToNumber(decimal: Prisma.Decimal | number | null | undefined): number {
  if (typeof decimal === 'number') {
    return isFinite(decimal) ? decimal : 0
  }
  
  if (!decimal) return 0
  
  try {
    const number = decimal.toNumber()
    
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
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to getFiscalQuarter')
  }

  const month = date.getMonth() + 1 // 1-12
  if (month >= 4 && month <= 6) return 1  // Q1: Apr-Jun
  if (month >= 7 && month <= 9) return 2  // Q2: Jul-Sep
  if (month >= 10 && month <= 12) return 3 // Q3: Oct-Dec
  return 4 // Q4: Jan-Mar
}

export class EnhancedSpendingCalculator {
  /**
   * Get the effective rate for a user at a specific date
   */
  static async getEffectiveRateForDate(userId: string, date: Date): Promise<number> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided')
    }

    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided')
    }

    // Get the most recent rate that was effective on or before the given date
    const rateHistory = await prisma.rateHistory.findFirst({
      where: {
        userId,
        effectiveDate: {
          lte: date
        }
      },
      orderBy: {
        effectiveDate: 'desc'
      }
    })

    if (rateHistory) {
      return safeDecimalToNumber(rateHistory.rate)
    }

    // Fallback to current user rate if no history found
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { employeeRate: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    return safeDecimalToNumber(user.employeeRate)
  }

  /**
   * Get all rate changes for a user within a date range
   */
  static async getRateHistoryForPeriod(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Array<{
    rate: number
    effectiveDate: Date
    endDate: Date | null
  }>> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided')
    }

    // Get all rate changes that affect this period
    const rateHistory = await prisma.rateHistory.findMany({
      where: {
        userId,
        effectiveDate: {
          lte: endDate
        }
      },
      orderBy: {
        effectiveDate: 'asc'
      }
    })

    // Also get the current rate as a fallback
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { employeeRate: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    const currentRate = safeDecimalToNumber(user.employeeRate)

    // If no history, use current rate for entire period
    if (rateHistory.length === 0) {
      return [{
        rate: currentRate,
        effectiveDate: startDate,
        endDate: null
      }]
    }

    // Process rate history to create periods
    const periods: Array<{
      rate: number
      effectiveDate: Date
      endDate: Date | null
    }> = []

    for (let i = 0; i < rateHistory.length; i++) {
      const current = rateHistory[i]
      const next = rateHistory[i + 1]
      
      const rate = safeDecimalToNumber(current.rate)
      const effectiveDate = new Date(current.effectiveDate)
      const endDate = next ? new Date(next.effectiveDate) : null

      // Only include periods that overlap with our date range
      if (endDate && endDate <= startDate) {
        continue // This period ended before our range
      }
      
      if (effectiveDate > endDate) {
        break // This period starts after our range
      }

      periods.push({
        rate,
        effectiveDate: effectiveDate < startDate ? startDate : effectiveDate,
        endDate: endDate && endDate > endDate ? endDate : endDate
      })
    }

    return periods
  }

  /**
   * Calculate spending for a time entry using historical rates
   */
  static async calculateTimeEntrySpending(
    timeEntry: {
      id: string
      userId: string
      hours: number | Prisma.Decimal
      date: Date
    }
  ): Promise<{
    cost: number
    rate: number
    quarter: 1 | 2 | 3 | 4
    quarterKey: string
  }> {
    const hours = safeDecimalToNumber(timeEntry.hours)
    const rate = await this.getEffectiveRateForDate(timeEntry.userId, timeEntry.date)
    const cost = hours * rate
    const quarter = getFiscalQuarter(timeEntry.date)
    const quarterKey = `q${quarter}Spent` as const

    if (!isFinite(cost)) {
      throw new Error('Invalid cost calculation')
    }

    return {
      cost,
      rate,
      quarter,
      quarterKey
    }
  }

  /**
   * Recalculate project spending using historical rates
   */
  static async updateProjectSpendingWithHistory(projectId: string): Promise<void> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID provided')
    }

    try {
      // Get all time entries for this project
      const timeEntries = await prisma.timeEntry.findMany({
        where: { projectId },
        select: {
          id: true,
          userId: true,
          hours: true,
          date: true
        },
        orderBy: {
          date: 'asc'
        }
      })

      let q1Spent = new Prisma.Decimal(0)
      let q2Spent = new Prisma.Decimal(0)
      let q3Spent = new Prisma.Decimal(0)
      let q4Spent = new Prisma.Decimal(0)

      // Process each entry with historical rate
      for (const entry of timeEntries) {
        try {
          const { cost, quarter } = await this.calculateTimeEntrySpending({
            id: entry.id,
            userId: entry.userId,
            hours: entry.hours,
            date: new Date(entry.date)
          })

          const costDecimal = new Prisma.Decimal(cost)

          switch (quarter) {
            case 1: q1Spent = q1Spent.add(costDecimal); break
            case 2: q2Spent = q2Spent.add(costDecimal); break
            case 3: q3Spent = q3Spent.add(costDecimal); break
            case 4: q4Spent = q4Spent.add(costDecimal); break
          }
        } catch (error) {
          console.warn('Error processing time entry:', entry.id, error)
        }
      }

      // Update project with recalculated spending
      await prisma.project.update({
        where: { id: projectId },
        data: {
          q1Spent,
          q2Spent,
          q3Spent,
          q4Spent
        }
      })

      console.log(`Updated spending for project ${projectId} with historical rates:`, {
        q1Spent: q1Spent.toFixed(2),
        q2Spent: q2Spent.toFixed(2),
        q3Spent: q3Spent.toFixed(2),
        q4Spent: q4Spent.toFixed(2)
      })

    } catch (error) {
      console.error('Failed to update project spending with history:', error)
      throw error
    }
  }

  /**
   * Update user rate and create rate history entry
   */
  static async updateUserRate(
    userId: string,
    newRate: number,
    effectiveDate: Date,
    adminUserId: string
  ): Promise<void> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID provided')
    }

    if (!adminUserId || typeof adminUserId !== 'string') {
      throw new Error('Invalid admin user ID provided')
    }

    if (typeof newRate !== 'number' || newRate < 0) {
      throw new Error('Invalid rate provided')
    }

    if (!effectiveDate || !(effectiveDate instanceof Date)) {
      throw new Error('Invalid effective date provided')
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Create rate history entry
        await tx.rateHistory.create({
          data: {
            userId,
            rate: new Prisma.Decimal(newRate),
            effectiveDate,
            createdBy: adminUserId
          }
        })

        // Update current rate if effective date is today or in the past
        const now = new Date()
        if (effectiveDate <= now) {
          await tx.user.update({
            where: { id: userId },
            data: { employeeRate: new Prisma.Decimal(newRate) }
          })
        }

        // Get all projects affected by this user
        const affectedProjects = await tx.projectUser.findMany({
          where: { userId },
          select: { projectId: true }
        })

        // Recalculate spending for all affected projects
        for (const { projectId } of affectedProjects) {
          await this.updateProjectSpendingWithHistory(projectId)
        }
      })

      console.log(`Updated rate for user ${userId} to ${newRate} effective ${effectiveDate.toISOString()}`)

    } catch (error) {
      console.error('Failed to update user rate:', error)
      throw error
    }
  }

  /**
   * Get detailed spending breakdown for a project with rate history
   */
  static async getProjectSpendingBreakdownWithHistory(
    projectId: string,
    fiscalYear?: number
  ): Promise<{
    employees: Array<{
      id: string
      name: string | null
      email: string
      totalHours: number
      totalSpending: number
      quarterlyHours: { q1: number; q2: number; q3: number; q4: number }
      quarterlySpending: { q1: number; q2: number; q3: number; q4: number }
      monthlyHours: Record<string, number>
      monthlySpending: Record<string, number>
      rateChanges: Array<{ date: Date; rate: number }>
    }>
    totals: {
      totalHours: number
      totalSpending: number
      quarterlyHours: { q1: number; q2: number; q3: number; q4: number }
      quarterlySpending: { q1: number; q2: number; q3: number; q4: number }
      monthlyHours: Record<string, number>
      monthlySpending: Record<string, number>
    }
  }> {
    const year = fiscalYear || new Date().getFullYear()
    const fiscalYearStart = new Date(year, 3, 1) // April 1st
    const fiscalYearEnd = new Date(year + 1, 2, 31) // March 31st next year

    // Get all time entries for the fiscal year
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        projectId,
        date: {
          gte: fiscalYearStart,
          lte: fiscalYearEnd
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    })

    // Get unique users
    const uniqueUsers = new Map<string, any>()
    timeEntries.forEach(entry => {
      if (!uniqueUsers.has(entry.user.id)) {
        uniqueUsers.set(entry.user.id, entry.user)
      }
    })

    const employees = []
    const totals = {
      totalHours: 0,
      totalSpending: 0,
      quarterlyHours: { q1: 0, q2: 0, q3: 0, q4: 0 },
      quarterlySpending: { q1: 0, q2: 0, q3: 0, q4: 0 },
      monthlyHours: {} as Record<string, number>,
      monthlySpending: {} as Record<string, number>
    }

    for (const user of uniqueUsers.values()) {
      const userEntries = timeEntries.filter(entry => entry.user.id === user.id)
      
      // Get rate history for this user during the fiscal year
      const rateHistory = await prisma.rateHistory.findMany({
        where: {
          userId: user.id,
          effectiveDate: {
            lte: fiscalYearEnd
          }
        },
        orderBy: {
          effectiveDate: 'desc'
        }
      })

      const employeeData = {
        id: user.id,
        name: user.name,
        email: user.email,
        totalHours: 0,
        totalSpending: 0,
        quarterlyHours: { q1: 0, q2: 0, q3: 0, q4: 0 },
        quarterlySpending: { q1: 0, q2: 0, q3: 0, q4: 0 },
        monthlyHours: {} as Record<string, number>,
        monthlySpending: {} as Record<string, number>,
        rateChanges: rateHistory.map(rh => ({
          date: new Date(rh.effectiveDate),
          rate: safeDecimalToNumber(rh.rate)
        }))
      }

      // Process each time entry with historical rate
      for (const entry of userEntries) {
        const entryDate = new Date(entry.date)
        const hours = safeDecimalToNumber(entry.hours)
        const monthKey = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`
        
        // Get effective rate for this entry
        const rate = await this.getEffectiveRateForDate(user.id, entryDate)
        const cost = hours * rate
        const quarter = getFiscalQuarter(entryDate)

        // Update employee totals
        employeeData.totalHours += hours
        employeeData.totalSpending += cost
        employeeData.quarterlyHours[`q${quarter}` as keyof typeof employeeData.quarterlyHours] += hours
        employeeData.quarterlySpending[`q${quarter}` as keyof typeof employeeData.quarterlySpending] += cost
        employeeData.monthlyHours[monthKey] = (employeeData.monthlyHours[monthKey] || 0) + hours
        employeeData.monthlySpending[monthKey] = (employeeData.monthlySpending[monthKey] || 0) + cost

        // Update project totals
        totals.totalHours += hours
        totals.totalSpending += cost
        totals.quarterlyHours[`q${quarter}` as keyof typeof totals.quarterlyHours] += hours
        totals.quarterlySpending[`q${quarter}` as keyof typeof totals.quarterlySpending] += cost
        totals.monthlyHours[monthKey] = (totals.monthlyHours[monthKey] || 0) + hours
        totals.monthlySpending[monthKey] = (totals.monthlySpending[monthKey] || 0) + cost
      }

      employees.push(employeeData)
    }

    return {
      employees: employees.sort((a, b) => b.totalHours - a.totalHours),
      totals
    }
  }

  /**
   * Recalculate all projects when rate history is enabled (migration helper)
   */
  static async migrateToHistoricalRates(): Promise<void> {
    try {
      console.log('Starting migration to historical rates...')

      // Get all users with their current rates
      const users = await prisma.user.findMany({
        select: {
          id: true,
          employeeRate: true,
          createdAt: true
        }
      })

      // Create initial rate history for all users (using their account creation date)
      for (const user of users) {
        const existingHistory = await prisma.rateHistory.findFirst({
          where: { userId: user.id }
        })

        if (!existingHistory) {
          await prisma.rateHistory.create({
            data: {
              userId: user.id,
              rate: user.employeeRate,
              effectiveDate: user.createdAt,
              createdBy: 'SYSTEM_MIGRATION'
            }
          })
          console.log(`Created initial rate history for user ${user.id}`)
        }
      }

      // Recalculate all project spending
      const projects = await prisma.project.findMany({
        select: { id: true, name: true }
      })

      console.log(`Recalculating spending for ${projects.length} projects...`)

      for (const project of projects) {
        try {
          await this.updateProjectSpendingWithHistory(project.id)
          console.log(`✅ Updated ${project.name}`)
        } catch (error) {
          console.error(`❌ Failed to update ${project.name}:`, error)
        }
      }

      console.log('✅ Migration to historical rates completed')

    } catch (error) {
      console.error('Migration failed:', error)
      throw error
    }
  }
}