// app/api/projects/[id]/update-spent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { requireAdmin } from '@/lib/permission'
import { SpendingCalculator } from '@/lib/spending-calculator'

interface RouteParams {
  params: Promise<{
    id: string // This is the project ID
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    // ✅ FIXED: Check admin permissions for recalculating spending
    const isAdmin = await requireAdmin(session.user.id)
    
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Admin access required' 
      }, { status: 403 })
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({
        error: 'Invalid project ID'
      }, { status: 400 })
    }

    // ✅ FIXED: Use the corrected SpendingCalculator
    const spent = await SpendingCalculator.updateProjectSpending(projectId)
    
    // Get updated project data to return
    const summary = await SpendingCalculator.getProjectSpendingSummary(projectId)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Spending recalculated successfully',
      projectId,
      summary
    })
  } catch (error) {
    console.error('Error recalculating budget:', error)
    return NextResponse.json({ 
      error: 'Failed to recalculate budget',
      details: error.message 
    }, { status: 500 })
  }
}

// Also support PUT method for compatibility
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return POST(request, { params })
}