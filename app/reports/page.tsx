'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { 
  Loader2, BarChart3, Clock, Calendar as CalendarIcon, Users, Shield, 
  FileText, Download, Edit2, Trash2, Plus, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react'
import { 
  format, startOfWeek, endOfWeek, eachDayOfInterval, 
  isSameDay, parseISO, startOfYear, endOfYear,
  addWeeks, subWeeks, addDays, subDays,
  startOfDay, endOfDay
} from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { setHours, setMinutes, setSeconds } from 'date-fns'

interface User {
  id: string
  name: string | null
  email: string
  role: string
}

interface Project {
  id: string
  name: string
  color: string
  code: string
}

interface TimeEntry {
  id: string
  start: string
  end: string | null
  duration: number
  project: { 
    id: string
    name: string
    color: string 
  } | null
  user: { 
    id: string
    email: string
    name: string | null 
  }
  description: string | null
}

interface ReportData {
  totalHours: number
  projectBreakdown: Array<{ name: string; color: string; hours: number }>
  dailyBreakdown: Array<{ date: string; hours: number }>
  entries: TimeEntry[]
}

export default function AdminReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  // Cache management for better performance and data consistency
  const [reportCache, setReportCache] = useState<Map<string, ReportData>>(new Map())
  
  // Date navigation - week and day view like first file
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [startDate, setStartDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [endDate, setEndDate] = useState<Date>(endOfWeek(new Date(), { weekStartsOn: 1 }))

  // Edit/Add entry state
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [addingEntry, setAddingEntry] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null)

  // Form state for editing entries
  const [formData, setFormData] = useState({
    projectId: '',
    description: '',
    startTime: '',
    endTime: '',
    date: format(new Date(), 'yyyy-MM-dd')
  })

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  // Update date ranges when selected date or view mode changes (same as first file)
  useEffect(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
      setStartDate(weekStart)
      setEndDate(weekEnd)
    } else {
      const dayStart = startOfDay(selectedDate)
      const dayEnd = endOfDay(selectedDate)
      setStartDate(dayStart)
      setEndDate(dayEnd)
    }
  }, [selectedDate, viewMode])

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchUsers()
      fetchProjects()
    }
  }, [session])

  useEffect(() => {
    if (selectedUser && startDate && endDate) {
      fetchReports(false) // Use cache if available
    }
  }, [selectedUser, selectedDate, viewMode])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  // Enhanced fetchReports with caching
  const fetchReports = async (forceRefresh = false) => {
    if (!selectedUser) return

    // Create a cache key based on user and date range
    const cacheKey = `${selectedUser}-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}`
    
    // Check cache first (unless forcing refresh)
    if (!forceRefresh && reportCache.has(cacheKey)) {
      const cachedData = reportCache.get(cacheKey)!
      setReportData(cachedData)
      setLoading(false)
      return
    }

    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    
    try {
      const params = new URLSearchParams({
        period: 'custom',
        userId: selectedUser,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
      
      const response = await fetch(`/api/reports?${params}`)
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
        
        // Cache the results
        setReportCache(prev => new Map(prev).set(cacheKey, data))
      } else {
        console.error('Failed to fetch reports:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Helper function to clear cache for specific dates
  const clearCacheForDate = (date: Date, userId: string) => {
    setReportCache(prev => {
      const newCache = new Map(prev)
      // Remove all cache entries that might contain this date
      for (const [key, data] of newCache.entries()) {
        if (key.startsWith(userId)) {
          // Check if the date falls within any cached date range
          const [, startDateStr, endDateStr] = key.split('-')
          const cacheStart = new Date(startDateStr)
          const cacheEnd = new Date(endDateStr)
          
          if (date >= cacheStart && date <= cacheEnd) {
            newCache.delete(key)
          }
        }
      }
      return newCache
    })
  }
  const hasOverlap = (newStart: Date, newEnd: Date | null, excludeId?: string): boolean => {
  if (!reportData) return false;
  
  return reportData.entries.some(entry => {
    if (entry.id === excludeId) return false;
    
    const existingStart = parseISO(entry.start);
    const existingEnd = entry.end ? parseISO(entry.end) : new Date();
    
    // Check if new entry overlaps with existing entry
    return (
      (newStart >= existingStart && newStart < existingEnd) ||
      (newEnd && newEnd > existingStart && newEnd <= existingEnd) ||
      (newStart <= existingStart && newEnd && newEnd >= existingEnd)
    );
  });
};

  // Navigation functions (same as first file)
  const goToPrevious = () => {
    if (viewMode === 'week') {
      setSelectedDate(prev => subWeeks(prev, 1))
    } else {
      setSelectedDate(prev => subDays(prev, 1))
    }
  }

  const goToNext = () => {
    if (viewMode === 'week') {
      setSelectedDate(prev => addWeeks(prev, 1))
    } else {
      setSelectedDate(prev => addDays(prev, 1))
    }
  }

  const goToCurrent = () => {
    setSelectedDate(new Date())
  }

  // Force refresh function
  const handleForceRefresh = async () => {
    if (!selectedUser) return
    
    // Clear cache for current period
    const cacheKey = viewMode === 'week' 
      ? `${selectedUser}-${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`
      : `${selectedUser}-${format(selectedDate, 'yyyy-MM-dd')}`
    
    setReportCache(prev => {
      const newCache = new Map(prev)
      newCache.delete(cacheKey)
      return newCache
    })
    
    await fetchReports(true)
    toast.success('Data refreshed')
  }

  const formatHours = (hours: number) => `${hours.toFixed(1)}h`
  const formatTime = (dateString: string) => format(parseISO(dateString), 'HH:mm')
  
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Running...'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getEntriesForDate = (date: Date) => {
    if (!reportData) return []
    return reportData.entries.filter(entry => 
      isSameDay(parseISO(entry.start), date)
    )
  }

  const getTotalDurationForDate = (date: Date) => {
    const entries = getEntriesForDate(date)
    return entries.reduce((total, entry) => total + entry.duration, 0)
  }

  const handleViewSummaryReport = () => {
    if (selectedUser) {
      const params = new URLSearchParams({
        startDate: startOfYear(new Date()).toISOString(),
        endDate: endOfYear(new Date()).toISOString()
      })
      router.push(`/reports/users/${selectedUser}?${params}`)
    }
  }

  const handleExportAllUsers = async () => {
    setExporting(true)
    try {
      const response = await fetch(`/api/reports/export-all`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const currentYear = new Date().getFullYear()
        a.download = `All_Users_Report_${currentYear}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('Report exported successfully')
      } else {
        toast.error('Failed to export report')
      }
    } catch (error) {
      console.error('Failed to export all users report:', error)
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }


  // Entry management functions
  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry)
    const startDate = parseISO(entry.start)
    setFormData({
      projectId: entry.project?.id || '',
      description: entry.description || '',
      startTime: format(startDate, 'HH:mm'),
      endTime: entry.end ? format(parseISO(entry.end), 'HH:mm') : '',
      date: format(startDate, 'yyyy-MM-dd')
    })
    setEditDialogOpen(true)
  }

  const handleAddEntry = (date?: Date, startTime?: string) => {
    setEditingEntry(null)
    setAddingEntry(true)
     const start = startTime ? parseISO(`${format(date || new Date(), 'yyyy-MM-dd')}T${startTime}`) : new Date();
    const end = startTime ? new Date(start.getTime() + 30 * 60000) : new Date(start.getTime() + 8 * 3600 * 1000);
      const defaultDurationInMinutes = 30; // Default duration of 30 minutes


 setFormData({
    projectId: '',
    description: '',
    startTime: format(startDate, 'HH:mm'),
    endTime: format(endDate, 'HH:mm'),
    date: format(date || new Date(), 'yyyy-MM-dd')
  });
  setEditDialogOpen(true);
};

  // Enhanced handleSaveEntry with cache invalidation
  const handleSaveEntry = async () => {
    try {
      const entryDate = new Date(formData.date)
      
      if (editingEntry) {
        // Update existing entry
        const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
        const endDateTime = formData.endTime 
          ? new Date(`${formData.date}T${formData.endTime}`)
          : null

            if (hasOverlap(startDateTime, endDateTime, editingEntry?.id)) {
              toast.error('This time entry overlaps with an existing entry. Please choose a different time.');
              return;
            }
          
        const response = await fetch(`/api/admin/time-entries/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedUser,
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: formData.startTime,
            endTime: formData.endTime || null,
            date: formData.date
          })
        })

        if (response.ok) {
          toast.success('Entry updated successfully')
          setEditDialogOpen(false)
          setEditingEntry(null)
          
          // Clear cache for the entry date and any date it might have been moved from
          clearCacheForDate(entryDate, selectedUser)
          if (editingEntry.start) {
            const originalDate = new Date(editingEntry.start)
            clearCacheForDate(originalDate, selectedUser)
          }
          
          // Refresh current view
          await fetchReports(true)
        } else {
          const errorData = await response.json()
          toast.error(`Failed to update entry: ${errorData.error || 'Unknown error'}`)
        }
      } else {
        // Create new entry
        const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
        const endDateTime = formData.endTime 
          ? new Date(`${formData.date}T${formData.endTime}`)
          : null

        

        const response = await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedUser,
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: formData.startTime,
            endTime: formData.endTime || null,
            date: formData.date
          })
        })

        if (response.ok) {
          toast.success('Entry created successfully')
          setEditDialogOpen(false)
          setAddingEntry(false)
          
          // Clear cache for the new entry date
          clearCacheForDate(entryDate, selectedUser)
          
          // Check if the new entry is in current view
          const isInCurrentView = viewMode === 'week' 
            ? entryDate >= startDate && entryDate <= endDate
            : isSameDay(entryDate, selectedDate)
          
          if (isInCurrentView) {
            await fetchReports(true)
          } else {
            toast.info(`Entry added for ${format(entryDate, 'MMM dd, yyyy')}. Navigate to that date to see it.`)
          }
        } else {
          const errorData = await response.json()
          toast.error(`Failed to create entry: ${errorData.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error saving entry:', error)
      toast.error(`Failed to ${editingEntry ? 'update' : 'create'} entry`)
    }
  }

  const handleDeleteEntry = async (entry: TimeEntry) => {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  // Enhanced confirmDeleteEntry with cache invalidation
  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return

    try {
      const response = await fetch(`/api/admin/time-entries/${entryToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser
        })
      })

      if (response.ok) {
        toast.success('Entry deleted successfully')
        setDeleteDialogOpen(false)
        setEntryToDelete(null)
        
        // Clear cache for the deleted entry date
        const entryDate = new Date(entryToDelete.start)
        clearCacheForDate(entryDate, selectedUser)
        
        // Refresh current view
        await fetchReports(true)
      } else {
        const errorText = await response.text()
        console.error('Delete failed:', errorText)
        toast.error('Failed to delete entry - Check permissions')
      }
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error('Failed to delete entry')
    }
  }

  const renderWeekView = () => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 })
    })
    
    return (
      <div className="space-y-2">
        {/* Week header */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="text-center">
              <div className="font-medium text-sm text-gray-600 mb-1">
                {format(day, 'EEE')}
              </div>
              <div className={cn(
                "text-lg font-semibold p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors",
                isSameDay(day, new Date()) && "bg-blue-100 text-blue-700",
                isSameDay(day, selectedDate) && "bg-blue-500 text-white"
              )}
              onClick={() => {
                setSelectedDate(day)
                setViewMode('day')
              }}
              >
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        
        {/* Week days */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const entries = getEntriesForDate(day)
            const totalMinutes = getTotalDurationForDate(day)
            const isToday = isSameDay(day, new Date())
            
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "border rounded-lg p-2 min-h-[200px] transition-colors relative",
                  isToday && "border-blue-500 bg-blue-50",
                  !isToday && "border-gray-200 hover:bg-gray-50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-sm font-medium",
                    isToday ? "text-blue-700" : "text-gray-700"
                  )}>
                    {format(day, 'MMM d')}
                  </span>
                </div>
                
                {totalMinutes > 0 && (
                  <Badge variant="secondary" className="text-xs mb-2">
                    {formatHours(totalMinutes)}
                  </Badge>
                )}
                
                <div className="space-y-1">
                  {entries.slice(0, 4).map((entry) => (
                    <div
                      key={entry.id}
                      className="text-xs p-1 rounded bg-white border-l-2 cursor-pointer hover:bg-gray-50 group relative"
                      style={{ borderLeftColor: entry.project?.color || '#gray' }}
                    >
                     {/* Entry content */}
                      <div onClick={() => handleEditEntry(entry)}>
                        <div className="font-medium truncate pr-6">
                          {entry.project?.name || 'No Project'}
                        </div>
                        <div className="text-gray-500 truncate">
                          {formatHours(entry.duration)}
                        </div>
                         <div className="text-gray-400 truncate text-[10px]">
                          {formatTime(entry.start)} - {entry.end ? formatTime(entry.end) : 'Running'}
                        </div>
                        {entry.description && (
                          <div className="text-gray-500 truncate text-[10px] mt-1">
                            {entry.description}
                          </div>
                        )}
                      </div>
                      
                      {/* Action buttons */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white rounded shadow-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditEntry(entry)
                          }}
                          className="p-1 hover:bg-blue-50 rounded"
                          title="Edit entry"
                        >
                          <Edit2 className="h-3 w-3 text-blue-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteEntry(entry)
                          }}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete entry"
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {entries.length > 4 && (
                    <div 
                      className="text-xs text-gray-500 text-center cursor-pointer hover:text-gray-700"
                      onClick={() => {
                        setSelectedDate(day)
                        setViewMode('day')
                      }}
                    >
                      +{entries.length - 4} more
                    </div>
                  )}
                </div>
                
                {/* Add button */}
                <button
                  onClick={() => handleAddEntry(day)}
                  className="absolute bottom-1 right-1 p-1 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-colors"
                  title="Add entry"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

const renderDayView = () => {
  const entries = getEntriesForDate(selectedDate);
  const totalMinutes = getTotalDurationForDate(selectedDate);
  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-4">
      {/* Day header */}
      <div className="text-center">
        <h3 className={cn(
          "text-2xl font-semibold mb-2",
          isToday ? "text-blue-700" : "text-gray-900"
        )}>
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </h3>
        <div className="flex items-center justify-center gap-4">
          {totalMinutes > 0 && (
            <Badge variant="secondary" className="text-sm">
              Total: {formatHours(totalMinutes)}
            </Badge>
          )}
        </div>
      </div>

      {/* Day entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Time Entries</CardTitle>
          <Button onClick={() => handleAddEntry(selectedDate)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No entries for this day</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => handleAddEntry(selectedDate)}
              >
                Add First Entry
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors group"
                  style={{ borderLeftWidth: '4px', borderLeftColor: entry.project?.color || '#gray' }}
                >
                  {/* Entry content */}
                      <div onClick={() => handleEditEntry(entry)}>
                        <div className="font-medium truncate pr-6">
                          {entry.project?.name || 'No Project'}
                        </div>
                        <div className="text-gray-500 truncate">
                          {formatHours(entry.duration)}
                        </div>
                         <div className="text-gray-400 truncate text-[10px]">
                          {formatTime(entry.start)} - {entry.end ? formatTime(entry.end) : 'Running'}
                        </div>
                        {entry.description && (
                          <div className="text-gray-500 truncate text-[10px] mt-1">
                            {entry.description}
                          </div>
                        )}
                      </div>
                     <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white rounded shadow-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditEntry(entry)
                          }}
                          className="p-1 hover:bg-blue-50 rounded"
                          title="Edit entry"
                        >
                          <Edit2 className="h-3 w-3 text-blue-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteEntry(entry)
                          }}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete entry"
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


  const selectedUserData = users.find(u => u.id === selectedUser)

  const getViewModeLabel = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
      return `Week of ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
    } else {
      return format(selectedDate, 'EEEE, MMMM d, yyyy')
    }
  }

  // Show access denied for non-admin users
  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (!session || session.user.role !== 'ADMIN') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access reports.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Admin Reports & Timesheet Management</h1>
            <p className="text-gray-600">View and manage detailed time tracking reports for all users</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportAllUsers}
              disabled={exporting}
              className="flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export All Users
            </Button>
            <Badge variant="default" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Admin Only
            </Badge>
          </div>
        </div>

        {/* User Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Selection
            </CardTitle>
            <CardDescription>Select a user to view and manage their time entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-center">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a user to view reports" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{user.name || user.email}</span>
                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className="ml-2">
                          {user.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedUser && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleForceRefresh} 
                    variant="outline"
                    disabled={refreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button 
                    onClick={handleViewSummaryReport} 
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    View Summary Report
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedUser && selectedUserData && (
          <>
            {/* Selected User Info */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Time Entries for: {selectedUserData.name || selectedUserData.email}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{selectedUserData.email}</span>
                  <Badge variant={selectedUserData.role === 'ADMIN' ? 'default' : 'secondary'}>
                    {selectedUserData.role}
                  </Badge>
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Navigation and View Controls (same as first file) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Navigation & View
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPrevious}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[200px] text-center py-2 px-3 border rounded">
                      {getViewModeLabel()}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNext}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md overflow-hidden border">
                      <Button
                        variant={viewMode === 'week' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('week')}
                        className="rounded-none border-0"
                      >
                        Week
                      </Button>
                      <Button
                        variant={viewMode === 'day' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('day')}
                        className="rounded-none border-0"
                      >
                        Day
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={goToCurrent}
                    >
                      {viewMode === 'week' ? 'Current Week' : 'Today'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleForceRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calendar View */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{viewMode === 'week' ? 'Week View' : 'Day View'}</span>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>
                      {viewMode === 'week' 
                        ? 'Click dates for day view • Click entries to edit • Hover for actions'
                        : 'Click entries to edit • Hover for actions'
                      }
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  viewMode === 'week' ? renderWeekView() : renderDayView()
                )}
              </CardContent>
            </Card>

            {/* Summary Cards */}
            {reportData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Hours ({viewMode === 'week' ? 'Week' : 'Day'})
                    </CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatHours(reportData.totalHours)}</div>
                    <p className="text-xs text-muted-foreground">
                      {getViewModeLabel()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.entries.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Completed entries
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.projectBreakdown.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Projects with time
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Project Breakdown */}
            {reportData && reportData.projectBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Project Breakdown</CardTitle>
                  <CardDescription>
                    Time spent on each project in the current {viewMode === 'week' ? 'week' : 'day'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportData.projectBreakdown.map((project, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="font-medium">{project.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold">{formatHours(project.hours)}</span>
                          <div className="text-sm text-muted-foreground">
                            {reportData.totalHours > 0 ? ((project.hours / reportData.totalHours) * 100).toFixed(1) : 0}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {reportData && reportData.entries.length === 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    No data for this {viewMode === 'week' ? 'week' : 'day'}
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {selectedUserData.name || selectedUserData.email} has no time entries for the selected {viewMode === 'week' ? 'week' : 'day'}.
                  </p>
                  <Button onClick={() => handleAddEntry()} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add First Entry
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* No User Selected State */}
        {!selectedUser && (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a User</h3>
              <p className="text-gray-600">
                Choose a user from the dropdown above to view and manage their detailed time tracking report.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Edit/Add Entry Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Edit Time Entry' : 'Add New Time Entry'}
              </DialogTitle>
              <DialogDescription>
                {editingEntry ? 'Make changes to the time entry below.' : 'Create a new time entry for the selected user.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input 
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project">Project</Label>
                <Select value={formData.projectId} onValueChange={(value) => setFormData({...formData, projectId: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects
                    .slice() // Create a copy to avoid mutating the original array
                   .sort((a, b) => {
                        const codeA = a.code || ''; // Fallback to empty string if code is undefined
                        const codeB = b.code || ''; // Fallback to empty string if code is undefined
                        return codeA.localeCompare(codeB);
                      }) // Sort by project code
                    .map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: project.color }}
                          />
                          {project.code}  {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="What work was done?"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input 
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input 
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                  />
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveEntry}>
                {editingEntry ? 'Update Entry' : 'Create Entry'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
              <AlertDialogDescription>
                <div>
                  Are you sure you want to delete this time entry? This action cannot be undone.
                </div>
                {entryToDelete && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                    <div className="font-medium mb-1">
                      {entryToDelete.project?.name || 'No Project'}
                    </div>
                    {entryToDelete.description && (
                      <div className="text-gray-600 mb-1">{entryToDelete.description}</div>
                    )}
                    <div className="text-gray-500 text-xs">
                      {formatHours(entryToDelete.duration)} on {format(parseISO(entryToDelete.start), 'MMM dd, yyyy')}
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteEntry} className="bg-red-600 hover:bg-red-700">
                Delete Entry
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}