// app/api/admin/users/password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import { z } from 'zod'

// Schema for creating a new user
const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'EMPLOYEE']),
  employeeRate: z.number().min(0).optional()
})

// Schema for resetting password
const resetPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  sendEmail: z.boolean().optional().default(false)
})

// PUT - Create new user
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = createUserSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      }, { status: 400 })
    }

    const { name, email, password, role, employeeRate } = result.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json({
        error: 'A user with this email already exists'
      }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        employeeRate: employeeRate || null
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        employeeRate: true
      }
    })

    // Log user creation for audit
    console.log(`New user created: ${email} by admin: ${session.user.email} at ${new Date().toISOString()}`)

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: newUser
    })

  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// POST - Reset user password
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = resetPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      }, { status: 400 })
    }

    const { userId, newPassword, sendEmail } = result.data

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    })

    if (!targetUser) {
      return NextResponse.json({
        error: 'User not found'
      }, { status: 404 })
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12)

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    })

    // Log password reset for security audit
    console.log(`Password reset for user: ${targetUser.email} by admin: ${session.user.email} at ${new Date().toISOString()}`)

    // TODO: If sendEmail is true, implement email notification here
    if (sendEmail) {
      // You can implement email sending logic here
      console.log(`Email notification requested for password reset: ${targetUser.email}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })

  } catch (error) {
    console.error('Failed to reset password:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
// DELETE - Delete user
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(NEXT_AUTH_CONFIG)
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get userId from URL search params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({
        error: 'User ID is required'
      }, { status: 400 })
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true }
    })

    if (!targetUser) {
      return NextResponse.json({
        error: 'User not found'
      }, { status: 404 })
    }

    // Prevent deleting admin users
    if (targetUser.role === 'ADMIN') {
      return NextResponse.json({
        error: 'Cannot delete admin users'
      }, { status: 403 })
    }

    // Prevent self-deletion
    if (targetUser.id === session.user.id) {
      return NextResponse.json({
        error: 'Cannot delete your own account'
      }, { status: 403 })
    }

    // Use a transaction to delete related records first, then the user
    await prisma.$transaction(async (tx) => {
      // Delete all rate history records for this user first
      await tx.rateHistory.deleteMany({
        where: { userId: userId }
      })

      // Add any other related record deletions here if needed
      // Examples (uncomment and adjust based on your actual schema):
      // await tx.timeEntry.deleteMany({ where: { userId } })
      // await tx.projectAssignment.deleteMany({ where: { userId } })
      // await tx.userSession.deleteMany({ where: { userId } })

      // Finally, delete the user
      await tx.user.delete({
        where: { id: userId }
      })
    })

    // Log user deletion for audit
    console.log(`User deleted: ${targetUser.email} by admin: ${session.user.email} at ${new Date().toISOString()}`)

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    })

  } catch (error) {
    console.error('Failed to delete user:', error)
    
    // Log detailed error information for debugging
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    
    // Handle specific Prisma errors
    if (error.code === 'P2003') {
      return NextResponse.json({
        error: 'Cannot delete user: user has associated records that must be removed first'
      }, { status: 400 })
    }
    
    if (error.code === 'P2025') {
      return NextResponse.json({
        error: 'User not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}