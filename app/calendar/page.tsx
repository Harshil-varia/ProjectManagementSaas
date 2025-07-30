'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard-layout'
import CalendarView from '@/components/time-entry/calendar-view'
import ManualEntryForm from '@/components/time-entry/manual-entry-form'

interface TimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  description: string | null
  project: {
    id: string
    name: string
    description: string | null
    color: string
  }
}

interface Project {
  active: boolean
  id: string
  name: string
  description: string | null
  color: string
}

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showManualForm, setShowManualForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchTimeEntries()
      fetchProjects()
    }
  }, [session])

  const fetchTimeEntries = async () => {
    try {
      const response = await fetch('/api/time-entries')
      const data = await response.json()
      setTimeEntries(data)
    } catch (error) {
      console.error('Error fetching time entries:', error)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      setProjects(data.filter((p: Project) => p.active !== false))
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEntry = (date: Date) => {
    setSelectedDate(date)
    setShowManualForm(true)
  }

  const handleEditEntry = (entry: TimeEntry) => {
    // TODO: Implement edit functionality
    console.log('Edit entry:', entry)
  }

  const handleSubmitManualEntry = async (entryData: {
    projectId: string
    description: string
    startTime: string
    endTime: string
    date: string
  }) => {
    try {
      const startDateTime = new Date(`${entryData.date}T${entryData.startTime}`)
      const endDateTime = new Date(`${entryData.date}T${entryData.endTime}`)
      const duration = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 60000)

      const response = await fetch('/api/time-entries/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: entryData.projectId,
          description: entryData.description,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          duration
        })
      })

      if (response.ok) {
        fetchTimeEntries()
        setShowManualForm(false)
        setSelectedDate(null)
      }
    } catch (error) {
      console.error('Error creating manual entry:', error)
    }
  }

  if (status === 'loading' || loading) {
    return <div>Loading...</div>
  }

  if (!session) {
    return null
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Calendar</h2>
          <p className="text-gray-600">View and manage your time entries in calendar format</p>
        </div>

        {showManualForm && (
          <ManualEntryForm
            projects={projects}
            selectedDate={selectedDate || undefined}
            onSubmit={handleSubmitManualEntry}
            onCancel={() => {
              setShowManualForm(false)
              setSelectedDate(null)
            }}
          />
        )}

        <CalendarView
          timeEntries={timeEntries}
          onAddEntry={handleAddEntry}
          onEditEntry={handleEditEntry}
        />
      </div>
    </DashboardLayout>
  )
}