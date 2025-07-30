import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import {NEXT_AUTH_CONFIG } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(NEXT_AUTH_CONFIG)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { userId, issue } = await request.json()

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Log the reminder (in a real app, you'd send an actual email)
    console.log(`📧 Reminder sent to ${user.email} (${user.name}): ${issue}`)
    
    // You could integrate with email services like:
    // - SendGrid
    // - AWS SES
    // - Resend
    // - Nodemailer
    
    // For now, we'll just simulate the email
    const emailContent = {
      to: user.email,
      subject: 'Time Tracking Reminder',
      body: `Hi ${user.name || 'there'},\n\nThis is a friendly reminder regarding your time tracking:\n\nIssue: ${issue}\n\nPlease make sure to log your time entries regularly.\n\nBest regards,\nTime Tracker Admin`
    }

    // TODO: Replace with actual email sending service
    console.log('Email would be sent:', emailContent)

    return NextResponse.json({ 
      message: 'Reminder sent successfully',
      sentTo: user.email,
      issue 
    })
  } catch (error) {
    console.error('Error sending reminder:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}