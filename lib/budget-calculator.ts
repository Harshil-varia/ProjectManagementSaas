// lib/budget-calculator.ts
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

interface TimeEntry {
  hours: number
  date: Date
  user: {
    employeeRate: number
  }
}

interface QuarterlyBudget {
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
}

export class BudgetCalculator {
  // ✅ FIXED: Safe decimal to number conversion
  private static safeDecimalToNumber(decimal: Decimal | number | null | undefined): number {
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

  private static getFiscalQuarter(date: Date): 1 | 2 | 3 | 4 {
    // Validate date input
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided to getFiscalQuarter')
    }
    
    const month = date.getMonth() + 1 // 1-12
    if (month >= 4 && month <= 6) return 1  // Q1: Apr-Jun
    if (month >= 7 && month <= 9) return 2  // Q2: Jul-Sep
    if (month >= 10 && month <= 12) return 3 // Q3: Oct-Dec
    return 4 // Q4: Jan-Mar
  }

  private static getFiscalYear(date: Date): number {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided to getFiscalYear')
    }
    
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    return month >= 4 ? year : year - 1
  }

  public static calculateQuarterlySpent(timeEntries: TimeEntry[]): {
    q1Spent: number
    q2Spent: number
    q3Spent: number
    q4Spent: number
  } {
    const quarterly = { q1Spent: 0, q2Spent: 0, q3Spent: 0, q4Spent: 0 }

    if (!timeEntries || !Array.isArray(timeEntries)) {
      return quarterly
    }

    timeEntries.forEach(entry => {
      // Validate entry data
      if (!entry || 
          typeof entry.hours !== 'number' || 
          isNaN(entry.hours) ||
          !entry.user ||
          typeof entry.user.employeeRate !== 'number' ||
          isNaN(entry.user.employeeRate) ||
          !entry.date) {
        console.warn('Invalid time entry data:', entry)
        return
      }

      try {
        const quarter = this.getFiscalQuarter(entry.date)
        const cost = entry.hours * entry.user.employeeRate
        
        // Ensure cost is a valid number
        if (isNaN(cost) || !isFinite(cost)) {
          console.warn('Invalid cost calculation for entry:', entry)
          return
        }
        
        switch (quarter) {
          case 1: quarterly.q1Spent += cost; break
          case 2: quarterly.q2Spent += cost; break
          case 3: quarterly.q3Spent += cost; break
          case 4: quarterly.q4Spent += cost; break
        }
      } catch (error) {
        console.warn('Error processing time entry:', entry, error)
      }
    })

    return quarterly
  }

  public static calculateBudgetUtilization(
    spent: number, 
    budget: number
  ): number {
    // Validate inputs
    if (typeof spent !== 'number' || isNaN(spent) || !isFinite(spent)) {
      spent = 0
    }
    if (typeof budget !== 'number' || isNaN(budget) || !isFinite(budget)) {
      budget = 0
    }

    // Handle zero or negative budget
    if (budget <= 0) {
      return spent > 0 ? Infinity : 0
    }

    const utilization = (spent / budget) * 100
    return isNaN(utilization) || !isFinite(utilization) ? 0 : utilization
  }

  public static getBudgetStatus(utilization: number): {
    status: 'on-track' | 'warning' | 'critical' | 'over-budget'
    color: string
    label: string
    overageAmount?: number
  } {
    // Handle invalid utilization values
    if (typeof utilization !== 'number' || isNaN(utilization)) {
      utilization = 0
    }

    if (utilization === Infinity) {
      return { 
        status: 'over-budget', 
        color: 'red', 
        label: 'No Budget Set' 
      }
    }

    if (utilization >= 100) {
      return { 
        status: 'over-budget', 
        color: 'red', 
        label: 'Over Budget',
        overageAmount: utilization - 100
      }
    }
    if (utilization >= 90) {
      return { status: 'critical', color: 'red', label: 'Critical' }
    }
    if (utilization >= 75) {
      return { status: 'warning', color: 'yellow', label: 'Warning' }
    }
    return { status: 'on-track', color: 'green', label: 'On Track' }
  }

  public static async updateProjectSpentAmounts(
    projectId: string,
    timeEntries: TimeEntry[]
  ): Promise<void> {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Invalid project ID')
    }

    const quarterlySpent = this.calculateQuarterlySpent(timeEntries)
    
    try {
      const response = await fetch(`/api/projects/${projectId}/update-spent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quarterlySpent)
      })

      if (!response.ok) {
        throw new Error(`Failed to update spent amounts: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Error updating project spent amounts:', error)
      throw error
    }
  }

  // ✅ FIXED: Safe currency formatting
  public static formatCurrency(amount: number | Decimal, showOverage: boolean = false): string {
    let numericAmount: number
    
    try {
      numericAmount = typeof amount === 'number' ? amount : this.safeDecimalToNumber(amount)
      
      // Handle invalid amounts
      if (typeof numericAmount !== 'number' || isNaN(numericAmount)) {
        numericAmount = 0
      }

      if (!isFinite(numericAmount)) {
        return showOverage ? 'No Limit' : '$0'
      }

      const prefix = showOverage && numericAmount > 0 ? '+' : ''
      
      return prefix + new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(Math.abs(numericAmount))
    } catch (error) {
      console.error('Currency formatting error:', error)
      return '$0'
    }
  }

  public static calculateProjections(
    currentSpent: number,
    currentDate: Date,
    quarterBudget: number,
    quarterStartDate: Date,
    quarterEndDate: Date
  ): {
    projectedSpend: number
    onTrackSpend: number
    variance: number
    isValid: boolean
    errorMessage?: string
  } {
    // Validate inputs
    const errors: string[] = []
    
    if (typeof currentSpent !== 'number' || isNaN(currentSpent) || !isFinite(currentSpent)) {
      currentSpent = 0
      errors.push('Invalid current spent amount')
    }

    if (!currentDate || !(currentDate instanceof Date) || isNaN(currentDate.getTime())) {
      errors.push('Invalid current date')
    }

    if (typeof quarterBudget !== 'number' || isNaN(quarterBudget) || !isFinite(quarterBudget)) {
      quarterBudget = 0
      errors.push('Invalid quarter budget')
    }

    if (!quarterStartDate || !(quarterStartDate instanceof Date) || isNaN(quarterStartDate.getTime())) {
      errors.push('Invalid quarter start date')
    }

    if (!quarterEndDate || !(quarterEndDate instanceof Date) || isNaN(quarterEndDate.getTime())) {
      errors.push('Invalid quarter end date')
    }

    if (errors.length > 0) {
      return {
        projectedSpend: 0,
        onTrackSpend: 0,
        variance: 0,
        isValid: false,
        errorMessage: errors.join(', ')
      }
    }

    // Ensure dates are in correct order
    if (quarterStartDate >= quarterEndDate) {
      return {
        projectedSpend: 0,
        onTrackSpend: 0,
        variance: 0,
        isValid: false,
        errorMessage: 'Quarter start date must be before end date'
      }
    }

    const totalDaysInQuarter = Math.ceil(
      (quarterEndDate.getTime() - quarterStartDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    
    const daysElapsed = Math.max(0, Math.ceil(
      (currentDate.getTime() - quarterStartDate.getTime()) / (1000 * 60 * 60 * 24)
    ))
    
    // Handle edge cases
    if (totalDaysInQuarter <= 0) {
      return {
        projectedSpend: currentSpent,
        onTrackSpend: quarterBudget,
        variance: currentSpent - quarterBudget,
        isValid: false,
        errorMessage: 'Invalid quarter duration'
      }
    }

    const progressPercent = Math.min(Math.max(daysElapsed / totalDaysInQuarter, 0), 1)
    let onTrackSpend = quarterBudget * progressPercent
    
    // Project based on current burn rate
    let projectedSpend: number
    if (daysElapsed <= 0) {
      // Before quarter starts
      projectedSpend = 0
    } else if (progressPercent >= 1) {
      // Quarter has ended
      projectedSpend = currentSpent
    } else {
      // During quarter - calculate burn rate
      const dailyBurnRate = currentSpent / daysElapsed
      projectedSpend = dailyBurnRate * totalDaysInQuarter
    }

    // Ensure all values are finite
    if (!isFinite(projectedSpend)) projectedSpend = currentSpent
    if (!isFinite(onTrackSpend)) onTrackSpend = 0

    const variance = projectedSpend - quarterBudget
    
    return {
      projectedSpend: Math.max(0, projectedSpend),
      onTrackSpend: Math.max(0, onTrackSpend),
      variance: isFinite(variance) ? variance : 0,
      isValid: true
    }
  }

  // Helper method to calculate overage amount in currency
  public static calculateOverageAmount(spent: number, budget: number): number {
    if (typeof spent !== 'number' || isNaN(spent) || !isFinite(spent)) {
      spent = 0
    }
    if (typeof budget !== 'number' || isNaN(budget) || !isFinite(budget) || budget <= 0) {
      return spent > 0 ? spent : 0
    }

    return Math.max(0, spent - budget)
  }

  // Helper method to get remaining budget
  public static getRemainingBudget(spent: number, budget: number): number {
    if (typeof spent !== 'number' || isNaN(spent) || !isFinite(spent)) {
      spent = 0
    }
    if (typeof budget !== 'number' || isNaN(budget) || !isFinite(budget)) {
      budget = 0
    }

    return Math.max(0, budget - spent)
  }

  // Helper method to format overage messages
  public static getOverageMessage(spent: number, budget: number): string {
    const overage = this.calculateOverageAmount(spent, budget)
    
    if (overage <= 0) {
      const remaining = this.getRemainingBudget(spent, budget)
      return `${this.formatCurrency(remaining)} remaining`
    }

    return `${this.formatCurrency(overage, true)} over budget`
  }

  // ✅ NEW: Safe Prisma Decimal utilities
  public static createDecimalFromInput(input: string | number): Decimal {
    // Always use string input to avoid precision loss
    const stringInput = typeof input === 'number' ? input.toString() : input
    return new Decimal(stringInput)
  }

  public static formatDecimalForDisplay(decimal: Decimal): string {
    try {
      const safeNumber = this.safeDecimalToNumber(decimal)
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(safeNumber)
    } catch (error) {
      console.error('Decimal display formatting error:', error)
      return `${decimal.toFixed(2)}`
    }
  }
}