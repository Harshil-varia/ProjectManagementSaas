// app/api/budgets/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { z } from 'zod'
import { SpendingCalculator } from '@/lib/spending-calculator'
import { EnhancedSpendingCalculator } from '@/lib/spending-calculator-enhanced'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

// ✅ FIXED: Safe monetary validation with string input using proper Decimal import
const budgetUpdateSchema = z.object({
  totalBudget: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const decimal = new Decimal(val)
        return decimal.gte('0') && decimal.lt('10000000') // Max $10M
      } catch {
        return false
      }
    }, 'Invalid total budget amount')
    .transform((val) => new Decimal(val)),
  
  q1Budget: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const decimal = new Decimal(val)
        return decimal.gte('0') && decimal.lt('10000000')
      } catch {
        return false
      }
    }, 'Invalid Q1 budget amount')
    .transform((val) => new Decimal(val)),
  
  q2Budget: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const decimal = new Decimal(val)
        return decimal.gte('0') && decimal.lt('10000000')
      } catch {
        return false
      }
    }, 'Invalid Q2 budget amount')
    .transform((val) => new Decimal(val)),
  
  q3Budget: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const decimal = new Decimal(val)
        return decimal.gte('0') && decimal.lt('10000000')
      } catch {
        return false
      }
    }, 'Invalid Q3 budget amount')
    .transform((val) => new Decimal(val)),
  
  q4Budget: z
    .union([z.string(), z.number()])
    .refine((val) => {
      try {
        const decimal = new Decimal(val)
        return decimal.gte('0') && decimal.lt('10000000')
      } catch {
        return false
      }
    }, 'Invalid Q4 budget amount')
    .transform((val) => new Decimal(val))
})

interface RouteParams {
  params: Promise<{
    id: string // This is the project ID
  }>
}

// ✅ FIXED: Safe helper function to convert Decimal to number for JSON serialization
const safeDecimalToNumber = (decimal: Prisma.Decimal): number => {
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
      // Return the string representation for display instead
      return parseFloat(decimal.toFixed(2))
    }
    
    return number
  } catch (error) {
    console.error('Decimal conversion error:', error)
    // Fallback to safe parsing
    return parseFloat(decimal.toFixed(2))
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    // Check if user has permission to view this project's budget
    const hasPermission = session.user.role === 'ADMIN' || 
      await prisma.projectPermission.findFirst({
        where: {
          userId: session.user.id,
          projectId,
          permission: { in: ['EDIT_BUDGETS', 'FULL_ACCESS'] }
        }
      })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        color: true,
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
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // ✅ FIXED: Safe conversion of Decimals to numbers for JSON response
    const formattedProject = {
      id: project.id,
      name: project.name,
      color: project.color,
      totalBudget: safeDecimalToNumber(project.totalBudget),
      q1Budget: safeDecimalToNumber(project.q1Budget),
      q2Budget: safeDecimalToNumber(project.q2Budget),
      q3Budget: safeDecimalToNumber(project.q3Budget),
      q4Budget: safeDecimalToNumber(project.q4Budget),
      q1Spent: safeDecimalToNumber(project.q1Spent),
      q2Spent: safeDecimalToNumber(project.q2Spent),
      q3Spent: safeDecimalToNumber(project.q3Spent),
      q4Spent: safeDecimalToNumber(project.q4Spent)
    }

    return NextResponse.json(formattedProject)
  } catch (error) {
    console.error('Failed to fetch budget:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    // Check if user has permission to edit budgets
    const hasPermission = session.user.role === 'ADMIN' || 
      await prisma.projectPermission.findFirst({
        where: {
          userId: session.user.id,
          projectId,
          permission: { in: ['EDIT_BUDGETS', 'FULL_ACCESS'] }
        }
      })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    
    // ✅ FIXED: Enhanced validation with proper error handling
    const result = budgetUpdateSchema.safeParse(body)
    
    if (!result.success) {
      console.error('Budget validation failed:', result.error.flatten())
      return NextResponse.json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      }, { status: 400 })
    }

    const { totalBudget, q1Budget, q2Budget, q3Budget, q4Budget } = result.data

    // Validate that quarterly budgets don't exceed total budget
    const totalQuarterlyBudget = q1Budget.add(q2Budget).add(q3Budget).add(q4Budget)
    if (totalQuarterlyBudget.gt(totalBudget)) {
      return NextResponse.json({
        error: 'Quarterly budgets exceed total budget',
        details: {
          totalBudget: totalBudget.toString(),
          quarterlySum: totalQuarterlyBudget.toString()
        }
      }, { status: 400 })
    }

    // Check if project exists and is active
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, active: true }
    })

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!existingProject.active) {
      return NextResponse.json({ 
        error: 'Cannot update budget for inactive project' 
      }, { status: 400 })
    }

    // ✅ FIXED: Update project budget with Prisma Decimals
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        totalBudget,
        q1Budget,
        q2Budget,
        q3Budget,
        q4Budget,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        color: true,
        totalBudget: true,
        q1Budget: true,
        q2Budget: true,
        q3Budget: true,
        q4Budget: true,
        q1Spent: true,
        q2Spent: true,
        q3Spent: true,
        q4Spent: true,
        updatedAt: true
      }
    })

    // Recalculate spending to ensure accuracy after budget update
    try {
      await EnhancedSpendingCalculator.updateProjectSpendingWithHistory(projectId)
      console.log(`Spending recalculated for project ${existingProject.name} after budget update`)
    } catch (error) {
      console.warn('Failed to recalculate spending after budget update:', error)
      // Don't fail the request if spending calculation fails
    }

    // ✅ FIXED: Safe conversion of Decimals to numbers for JSON response
    const formattedProject = {
      id: updatedProject.id,
      name: updatedProject.name,
      color: updatedProject.color,
      totalBudget: safeDecimalToNumber(updatedProject.totalBudget),
      q1Budget: safeDecimalToNumber(updatedProject.q1Budget),
      q2Budget: safeDecimalToNumber(updatedProject.q2Budget),
      q3Budget: safeDecimalToNumber(updatedProject.q3Budget),
      q4Budget: safeDecimalToNumber(updatedProject.q4Budget),
      q1Spent: safeDecimalToNumber(updatedProject.q1Spent),
      q2Spent: safeDecimalToNumber(updatedProject.q2Spent),
      q3Spent: safeDecimalToNumber(updatedProject.q3Spent),
      q4Spent: safeDecimalToNumber(updatedProject.q4Spent),
      updatedAt: updatedProject.updatedAt
    }

    // Log budget update for audit with safe decimal display
    console.log(`Budget updated for project: ${existingProject.name} by user: ${session.user.email} at ${new Date().toISOString()}`)
    console.log(`New budgets - Total: $${totalBudget.toFixed(2)}, Q1: $${q1Budget.toFixed(2)}, Q2: $${q2Budget.toFixed(2)}, Q3: $${q3Budget.toFixed(2)}, Q4: $${q4Budget.toFixed(2)}`)

    return NextResponse.json({
      success: true,
      message: 'Budget updated successfully',
      project: formattedProject
    })

  }  catch (error) {
    console.error('Failed to update budget:', getErrorMessage(error))
    
    // Handle Prisma/Zod errors specifically with type safety
    if (error && typeof error === 'object') {
      // Handle Zod errors
      if ('name' in error && error.name === 'ZodError') {
        return NextResponse.json({
          error: 'Validation failed',
          details: 'errors' in error ? error.errors : 'Unknown validation error'
        }, { status: 400 })
      }

      // Handle Prisma errors
      if ('code' in error && error.code === 'P2002') {
        return NextResponse.json({
          error: 'Database constraint violation'
        }, { status: 400 })
      }
    }

    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}