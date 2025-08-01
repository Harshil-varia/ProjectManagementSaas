'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard-layout'
import UserOversight from '@/components/Admin/user-oversight'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield } from 'lucide-react'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [reminderSent, setReminderSent] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/calendar')
    }
  }, [session, status, router])

  const handleSendReminder = async (userId: string, issue: string) => {
    try {
      const response = await fetch('/api/admin/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, issue })
      })

      if (response.ok) {
        setReminderSent(`Reminder sent for: ${issue}`)
        setTimeout(() => setReminderSent(null), 3000)
      }
    } catch (error) {
      console.error('Error sending reminder:', error)
    }
  }

  if (status === 'loading') {
    return <div>Loading...</div>
  }

  if (!session || session.user.role !== 'ADMIN') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="text-gray-600">Monitor user time tracking and send reminders</p>
        </div>

        {reminderSent && (
          <Alert>
            <AlertDescription>{reminderSent}</AlertDescription>
          </Alert>
        )}

        <UserOversight onSendReminder={handleSendReminder} />
      </div>
    </DashboardLayout>
  )
}