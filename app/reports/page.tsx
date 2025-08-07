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
  FileText, Download, Edit2, Trash2, Plus, RefreshCw
} from 'lucide-react'
import { 
  format, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, 
  isSameDay, parseISO, startOfYear, endOfYear, startOfMonth, endOfMonth, eachWeekOfInterval
} from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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
  const [period] = useState('month') // Fixed to month
  
  // Cache management for better performance and data consistency
  const [reportCache, setReportCache] = useState<Map<string, ReportData>>(new Map())
  
  // Date navigation - only month view
  const [selectedDate, setSelectedDate] = useState(new Date())
  
  // Date range state for filtering
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()))
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()))

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
    duration: 0,
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

  // Update date ranges when selected date changes
  useEffect(() => {
    const monthStart = startOfMonth(selectedDate)
    const monthEnd = endOfMonth(selectedDate)
    setStartDate(monthStart)
    setEndDate(monthEnd)
  }, [selectedDate])

  // Auto-refresh data when month changes (if user is selected)
  useEffect(() => {
    if (selectedUser && startDate && endDate) {
      // Force refresh when month changes
      fetchReports(true)
    }
  }, [selectedDate]) // Only depends on selectedDate to trigger refresh on month change

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchUsers()
      fetchProjects()
    }
  }, [session])

  useEffect(() => {
    if (selectedUser && startDate && endDate) {
      fetchReports(false) // Use cache if available (for initial load)
    }
  }, [selectedUser, startDate, endDate]) // This handles initial load and user changes

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

    setLoading(true)
    try {
      const params = new URLSearchParams({
        period,
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

  // Force refresh function
  const handleForceRefresh = async () => {
    if (!selectedUser) return
    
    // Clear all cache for current user
    setReportCache(prev => {
      const newCache = new Map(prev)
      for (const key of newCache.keys()) {
        if (key.startsWith(selectedUser)) {
          newCache.delete(key)
        }
      }
      return newCache
    })
    
    await fetchReports(true)
    toast.success('Data refreshed')
  }

  const formatHours = (hours: number) => `${hours.toFixed(1)}h`
  const formatTime = (dateString: string) => format(parseISO(dateString), 'HH:mm')
  
  // Navigation functions with automatic refresh
  const goToPreviousMonth = () => {
    setSelectedDate(prev => subMonths(prev, 1))
    // No need for setTimeout - useEffect will handle the refresh
  }

  const goToNextMonth = () => {
    setSelectedDate(prev => addMonths(prev, 1))
    // No need for setTimeout - useEffect will handle the refresh
  }

  const goToCurrentMonth = () => {
    setSelectedDate(new Date())
    // No need for setTimeout - useEffect will handle the refresh
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

  const handleDateRangeQuickSelect = (type: 'thisMonth' | 'lastMonth') => {
    const now = new Date()
    switch (type) {
      case 'thisMonth':
        setSelectedDate(now)
        // useEffect will handle the refresh automatically
        break
      case 'lastMonth':
        const lastMonth = subMonths(now, 1)
        setSelectedDate(lastMonth)
        // useEffect will handle the refresh automatically
        break
    }
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
      duration: entry.duration / 60, // Convert minutes to hours for display
      date: format(startDate, 'yyyy-MM-dd')
    })
    setEditDialogOpen(true)
  }

  const handleAddEntry = () => {
    setEditingEntry(null)
    setAddingEntry(true)
    setFormData({
      projectId: '',
      description: '',
      startTime: '09:00',
      endTime: '17:00',
      duration: 8,
      date: format(new Date(), 'yyyy-MM-dd')
    })
    setEditDialogOpen(true)
  }

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

        const duration = endDateTime 
          ? Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 60000)
          : formData.duration * 60

        const response = await fetch(`/api/admin/time-entries/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedUser,
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: formData.startTime,
            endTime: formData.endTime || null,
            duration,
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

        const duration = endDateTime 
          ? Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 60000)
          : formData.duration * 60

        const response = await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedUser,
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: formData.startTime,
            endTime: formData.endTime || null,
            duration,
            date: formData.date
          })
        })

        if (response.ok) {
          const responseData = await response.json()
          toast.success('Entry created successfully')
          setEditDialogOpen(false)
          setAddingEntry(false)
          
          // Clear cache for the new entry date
          clearCacheForDate(entryDate, selectedUser)
          
          // If the new entry is in the current view, refresh immediately
          if (entryDate >= startDate && entryDate <= endDate) {
            await fetchReports(true)
          } else {
            // Entry is outside current view - notify user
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

  // Render month calendar view with enhanced entry management
  const renderMonthView = () => {
    const monthStart = startOfMonth(selectedDate)
    const monthEnd = endOfMonth(selectedDate)
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
    
    return (
      <div className="space-y-2">
        {/* Month header */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="text-center font-medium p-2 text-sm text-gray-600">
              {day}
            </div>
          ))}
        </div>
        
        {/* Month days */}
        {weeks.map((weekStart, weekIndex) => {
          const weekDays = eachDayOfInterval({
            start: startOfWeek(weekStart, { weekStartsOn: 1 }),
            end: endOfWeek(weekStart, { weekStartsOn: 1 })
          })
          
          return (
            <div key={weekIndex} className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const entries = getEntriesForDate(day)
                const totalHours = getTotalDurationForDate(day)
                const isToday = isSameDay(day, new Date())
                const isCurrentMonth = day >= monthStart && day <= monthEnd
                
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border rounded-lg p-2 min-h-[120px] transition-colors",
                      isToday && "border-blue-500 bg-blue-50",
                      !isCurrentMonth && "opacity-50 bg-gray-50",
                      isCurrentMonth && !isToday && "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "text-sm font-medium",
                        isToday ? "text-blue-700" : "text-gray-700"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    
                    {totalHours > 0 && (
                      <Badge variant="secondary" className="text-xs mb-1">
                        {formatHours(totalHours)}
                      </Badge>
                    )}
                    
                    <div className="space-y-1">
                      {entries.slice(0, 3).map((entry) => (
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
                          </div>
                          
                          {/* Action buttons - only show on hover */}
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
                      {entries.length > 3 && (
                        <div className="text-xs text-gray-500 text-center cursor-pointer hover:text-gray-700"
                             onClick={() => {
                               // Could expand to show all entries or navigate to detailed view
                               toast.info(`${entries.length} total entries for ${format(day, 'MMM dd')}`)
                             }}>
                          +{entries.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  const selectedUserData = users.find(u => u.id === selectedUser)

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

        {/* User Selection & Date Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Selection & Month Navigation
            </CardTitle>
            <CardDescription>Select a user and navigate through months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* User Selection Row */}
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
                      disabled={loading}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
                    <Button 
                      onClick={handleAddEntry} 
                      variant="default"
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Entry
                    </Button>
                  </div>
                )}
              </div>

              {/* Month Navigation */}
              {selectedUser && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    {/* Month Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Month</label>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToPreviousMonth}
                        >
                          ←
                        </Button>
                        <div className="min-w-[120px] text-center py-2 px-3 border rounded">
                          {format(selectedDate, 'MMM yyyy')}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={goToNextMonth}
                        >
                          →
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quick Select</label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleDateRangeQuickSelect('thisMonth')}>
                          This Month
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDateRangeQuickSelect('lastMonth')}>
                          Last Month
                        </Button>
                        <Button variant="ghost" size="sm" onClick={goToCurrentMonth}>
                          Current Month
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600">
                    Showing month of: {format(selectedDate, 'MMMM yyyy')}
                  </div>
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
                  Monthly Report for: {selectedUserData.name || selectedUserData.email}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{selectedUserData.email}</span>
                  <Badge variant={selectedUserData.role === 'ADMIN' ? 'default' : 'secondary'}>
                    {selectedUserData.role}
                  </Badge>
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Calendar View */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    Monthly Calendar View
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={goToCurrentMonth}
                    >
                      Current Month
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {format(selectedDate, 'MMMM yyyy')}
                  <span className="ml-2 text-xs text-blue-600">Click entries to edit • Hover for edit/delete buttons</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  renderMonthView()
                )}
              </CardContent>
            </Card>

            {/* Summary Cards */}
            {reportData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Hours (Month)
                    </CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatHours(reportData.totalHours)}</div>
                    <p className="text-xs text-muted-foreground">
                      {format(selectedDate, 'MMM yyyy')}
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
                    Time spent on each project this month
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
                            {((project.hours / reportData.totalHours) * 100).toFixed(1)}%
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
                    No data for this month
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {selectedUserData.name || selectedUserData.email} has no time entries for the selected month.
                  </p>
                  <Button onClick={handleAddEntry} className="flex items-center gap-2">
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
              <p className="text-gray-500">
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
                    <SelectValue placeholder="Select a project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: project.color }}
                          />
                          {project.name}
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
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (hours)</Label>
                <Input 
                  id="duration"
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.duration}
                  onChange={(e) => setFormData({...formData, duration: parseFloat(e.target.value) || 0})}
                />
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