
import { withPermissions } from "@/lib/permission";
import { PermissionType } from "@/app/generated/prisma";
import { prisma } from '@/lib/prisma'

interface QuarterlyData {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

interface MonthlyData {
  [month: string]: number;
}

interface EmployeeData {
  id: string;
  name: string;
  email: string;
  rate: number;
  quarterly: QuarterlyData;
  monthly: MonthlyData;
  total: number;
  totalCost: number;
}

interface ProjectReportData {
  project: {
    id: string;
    name: string;
    description: string | null;
  };
  employees: EmployeeData[];
  totals: {
    hours: QuarterlyData & { total: number };
    costs: QuarterlyData & { total: number };
    monthly: MonthlyData;
  };
  budget: {
    total: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    spent: QuarterlyData & { total: number };
    remaining: QuarterlyData & { total: number };
    utilization: QuarterlyData & { total: number };
  };
  isValid: boolean;
  errors: string[];
}

class ReportGenerator {
  static getQuarterFromDate(date: Date): number {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided to getQuarterFromDate')
    }

    const month = date.getMonth() + 1;
    if (month >= 4 && month <= 6) return 1;
    if (month >= 7 && month <= 9) return 2;
    if (month >= 10 && month <= 12) return 3;
    return 4;
  }

  static getMonthKey(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Invalid date provided to getMonthKey')
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${month.toString().padStart(2, '0')}`;
  }

  static safeToNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    let num: number;
    if (typeof value === 'object' && typeof value.toNumber === 'function') {
      // Handle Prisma Decimal
      num = value.toNumber();
    } else if (typeof value === 'number') {
      num = value;
    } else if (typeof value === 'string') {
      num = parseFloat(value);
    } else {
      return defaultValue;
    }

    return isNaN(num) || !isFinite(num) ? defaultValue : num;
  }

  static calculateUtilization(spent: number, budget: number): number {
    if (budget <= 0) {
      return spent > 0 ? Infinity : 0;
    }
    const utilization = (spent / budget) * 100;
    return isNaN(utilization) || !isFinite(utilization) ? 0 : utilization;
  }

  static async generateProjectReport(projectId: string): Promise<ProjectReportData> {
    const errors: string[] = [];
    
    if (!projectId || typeof projectId !== 'string') {
      return {
        project: { id: '', name: '', description: null },
        employees: [],
        totals: { hours: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, costs: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, monthly: {} },
        budget: { total: 0, q1: 0, q2: 0, q3: 0, q4: 0, spent: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, remaining: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, utilization: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 } },
        isValid: false,
        errors: ['Invalid project ID']
      };
    }

    try {
      // Get project details
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          timeEntries: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeRate: true,
                },
              },
            },
          },
        },
      });

      if (!project) {
        return {
          project: { id: projectId, name: 'Project Not Found', description: null },
          employees: [],
          totals: { hours: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, costs: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, monthly: {} },
          budget: { total: 0, q1: 0, q2: 0, q3: 0, q4: 0, spent: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, remaining: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, utilization: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 } },
          isValid: false,
          errors: ['Project not found']
        };
      }

      // Initialize data structures
      const employeeMap = new Map<string, EmployeeData>();
      const projectTotals = {
        hours: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 },
        costs: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 },
        monthly: {} as MonthlyData,
      };

      // Process time entries
      if (project.timeEntries && Array.isArray(project.timeEntries)) {
        project.timeEntries.forEach((entry, index) => {
          try {
            if (!entry || !entry.user) {
              errors.push(`Invalid time entry at index ${index}`);
              return;
            }

            const userId = entry.user.id;
            if (!userId) {
              errors.push(`Missing user ID for time entry at index ${index}`);
              return;
            }

            const hours = this.safeToNumber(entry.hours);
            const rate = this.safeToNumber(entry.user.employeeRate);

            if (hours <= 0) {
              errors.push(`Invalid hours (${hours}) for entry at index ${index}`);
              return;
            }

            if (rate < 0) {
              errors.push(`Invalid rate (${rate}) for user ${userId}`);
              return;
            }

            if (!entry.date) {
              errors.push(`Missing date for time entry at index ${index}`);
              return;
            }

            const entryDate = new Date(entry.date);
            if (isNaN(entryDate.getTime())) {
              errors.push(`Invalid date for time entry at index ${index}`);
              return;
            }

            const quarter = this.getQuarterFromDate(entryDate);
            const monthKey = this.getMonthKey(entryDate);
            const cost = hours * rate;

            // Initialize employee data if not exists
            if (!employeeMap.has(userId)) {
              employeeMap.set(userId, {
                id: userId,
                name: entry.user.name || 'Unknown User',
                email: entry.user.email || 'No Email',
                rate: rate,
                quarterly: { q1: 0, q2: 0, q3: 0, q4: 0 },
                monthly: {},
                total: 0,
                totalCost: 0,
              });
            }

            const employee = employeeMap.get(userId)!;

            // Update employee data
            switch (quarter) {
              case 1: employee.quarterly.q1 += hours; break;
              case 2: employee.quarterly.q2 += hours; break;
              case 3: employee.quarterly.q3 += hours; break;
              case 4: employee.quarterly.q4 += hours; break;
            }

            employee.monthly[monthKey] = (employee.monthly[monthKey] || 0) + hours;
            employee.total += hours;
            employee.totalCost += cost;

            // Update project totals
            switch (quarter) {
              case 1:
                projectTotals.hours.q1 += hours;
                projectTotals.costs.q1 += cost;
                break;
              case 2:
                projectTotals.hours.q2 += hours;
                projectTotals.costs.q2 += cost;
                break;
              case 3:
                projectTotals.hours.q3 += hours;
                projectTotals.costs.q3 += cost;
                break;
              case 4:
                projectTotals.hours.q4 += hours;
                projectTotals.costs.q4 += cost;
                break;
            }

            projectTotals.hours.total += hours;
            projectTotals.costs.total += cost;
            projectTotals.monthly[monthKey] = (projectTotals.monthly[monthKey] || 0) + cost;

          } catch (entryError) {
            errors.push(`Error processing time entry at index ${index}: ${entryError.message}`);
          }
        });
      }

      // Safe budget extraction
      const totalBudget = this.safeToNumber(project.totalBudget);
      const q1Budget = this.safeToNumber(project.q1Budget);
      const q2Budget = this.safeToNumber(project.q2Budget);
      const q3Budget = this.safeToNumber(project.q3Budget);
      const q4Budget = this.safeToNumber(project.q4Budget);

      // Calculate utilization
      const utilization = {
        total: this.calculateUtilization(projectTotals.costs.total, totalBudget),
        q1: this.calculateUtilization(projectTotals.costs.q1, q1Budget),
        q2: this.calculateUtilization(projectTotals.costs.q2, q2Budget),
        q3: this.calculateUtilization(projectTotals.costs.q3, q3Budget),
        q4: this.calculateUtilization(projectTotals.costs.q4, q4Budget),
      };

      return {
        project: {
          id: project.id,
          name: project.name || 'Unnamed Project',
          description: project.description,
        },
        employees: Array.from(employeeMap.values()),
        totals: projectTotals,
        budget: {
          total: totalBudget,
          q1: q1Budget,
          q2: q2Budget,
          q3: q3Budget,
          q4: q4Budget,
          spent: {
            total: projectTotals.costs.total,
            q1: projectTotals.costs.q1,
            q2: projectTotals.costs.q2,
            q3: projectTotals.costs.q3,
            q4: projectTotals.costs.q4,
          },
          remaining: {
            total: Math.max(0, totalBudget - projectTotals.costs.total),
            q1: Math.max(0, q1Budget - projectTotals.costs.q1),
            q2: Math.max(0, q2Budget - projectTotals.costs.q2),
            q3: Math.max(0, q3Budget - projectTotals.costs.q3),
            q4: Math.max(0, q4Budget - projectTotals.costs.q4),
          },
          utilization,
        },
        isValid: errors.length === 0,
        errors,
      };

    } catch (error) {
      console.error('Error generating project report:', error);
      return {
        project: { id: projectId, name: 'Error Loading Project', description: null },
        employees: [],
        totals: { hours: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, costs: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, monthly: {} },
        budget: { total: 0, q1: 0, q2: 0, q3: 0, q4: 0, spent: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, remaining: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }, utilization: { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 } },
        isValid: false,
        errors: [`Database error: ${error.message}`]
      };
    }
  }
}

export default withPermissions(PermissionType.VIEW_REPORTS, async (req, res, user, projectId) => {
  if (req.method === 'GET') {
    try {
      const reportData = await ReportGenerator.generateProjectReport(projectId);
      
      // Log warnings if there were errors but still return data
      if (!reportData.isValid && reportData.errors.length > 0) {
        console.warn('Report generated with warnings:', reportData.errors);
      }
      
      res.status(200).json(reportData);
    } catch (error) {
      console.error('Error generating project report:', error);
      res.status(500).json({ 
        error: 'Failed to generate project report',
        details: error.message,
        isValid: false,
        errors: [error.message]
      });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
});