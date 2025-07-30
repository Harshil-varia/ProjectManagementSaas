// lib/budget-api-client.ts
/**
 * Client-side API helper for budget operations
 * Ensures proper data flow and state management
 */

interface BudgetUpdateData {
  totalBudget: number
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
}

interface ProjectData {
  id: string
  name: string
  color: string
  totalBudget: number
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
  q1Spent: number
  q2Spent: number
  q3Spent: number
  q4Spent: number
}

export class BudgetApiClient {
  /**
   * Update project budget and return fresh data
   */
  static async updateProjectBudget(
    projectId: string, 
    budgetData: BudgetUpdateData
  ): Promise<ProjectData> {
    console.log('BudgetApiClient: Updating budget for project', projectId, budgetData)

    try {
      // Step 1: Update the budget via the budget API
      const updateResponse = await fetch(`/api/budgets/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(budgetData),
      })

      if (!updateResponse.ok) {
        const error = await updateResponse.json()
        throw new Error(error.error || 'Failed to update budget')
      }

      const updateResult = await updateResponse.json()
      console.log('BudgetApiClient: Budget update response:', updateResult)

      // Step 2: Wait a moment for any database operations to complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 3: Fetch the latest project data to ensure accuracy
      const freshDataResponse = await fetch(`/api/budgets/${projectId}?fresh=true&_t=${Date.now()}`)
      
      if (!freshDataResponse.ok) {
        console.warn('BudgetApiClient: Failed to fetch fresh data, using update response')
        return updateResult.project || updateResult
      }

      const freshData = await freshDataResponse.json()
      console.log('BudgetApiClient: Fresh data retrieved:', freshData)

      return freshData
    } catch (error) {
      console.error('BudgetApiClient: Error in updateProjectBudget:', error)
      throw error
    }
  }

  /**
   * Fetch all projects with budget data
   */
  static async fetchAllProjects(): Promise<ProjectData[]> {
    console.log('BudgetApiClient: Fetching all projects with budget data')

    try {
      const response = await fetch(`/api/projects?include=budget&fresh=true&_t=${Date.now()}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch projects')
      }

      const projects = await response.json()
      console.log('BudgetApiClient: Fetched projects:', projects.length, 'projects')

      return Array.isArray(projects) ? projects : []
    } catch (error) {
      console.error('BudgetApiClient: Error fetching projects:', error)
      throw error
    }
  }

  /**
   * Recalculate spending for a project
   */
  static async recalculateProjectSpending(projectId: string): Promise<void> {
    console.log('BudgetApiClient: Recalculating spending for project', projectId)

    try {
      const response = await fetch(`/api/projects/${projectId}/update-spent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to recalculate spending')
      }

      console.log('BudgetApiClient: Spending recalculated successfully')
    } catch (error) {
      console.error('BudgetApiClient: Error recalculating spending:', error)
      // Don't throw - this is not critical for budget updates
    }
  }
}

export default BudgetApiClient