'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Edit2, 
  Trash2, 
  Plus,
  RefreshCw,
  AlertTriangle,
  Shield,
  Search,
  Filter,
  List
} from 'lucide-react'
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isBefore,
  isWithinInterval,
  subDays
} from 'date-fns'
import { cn } from '@/lib/utils'
import DashboardLayout from '@/components/dashboard-layout'
import { toast } from 'sonner'

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
  const [filteredEntries, setFilteredEntries] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('calendar')
  
  // Cache management
  const [entryCache, setEntryCache] = useState<Map<string, TimeEntry[]>>(new Map())
  
  // Month navigation
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()))
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()))
  
  // Entry management
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null)
  const [adminAlertOpen, setAdminAlertOpen] = useState(false)
  const [adminAlertMessage, setAdminAlertMessage] = useState('')
  
  // Filters for timesheet view
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState('all')
  const [dateRange, setDateRange] = useState('week')
  const [sortBy, setSortBy] = useState('date-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)
  
  // Form state
  const [formData, setFormData] = useState({
    projectId: '',
    description: '',
    startTime: '',
    endTime: '',
    duration: 0,
    date: format(new Date(), 'yyyy-MM-dd')
  })

  // Helper function to check if editing past entries is restricted
  const isEditingRestricted = (entryDate: Date) => {
    const today = new Date()
    
    // Get the month of the entry we're trying to edit
    const entryYear = entryDate.getFullYear()
    const entryMonth = entryDate.getMonth() // 0-based (0 = January, 11 = December)
    
    // Calculate the 15th of the month AFTER the entry month (entry month + 1)
    const nextMonth = entryMonth + 1
    const nextYear = nextMonth > 11 ? entryYear + 1 : entryYear // Handle December -> January
    const adjustedNextMonth = nextMonth > 11 ? 0 : nextMonth
    
    const fifteenthOfNextMonth = new Date(nextYear, adjustedNextMonth, 15)
    
    // If today is past the 15th of (entry month + 1), restrict editing
    return today > fifteenthOfNextMonth
  }

  // Helper to clear cache for specific dates
  const clearCacheForDate = (date: Date) => {
    const monthKey = format(startOfMonth(date), 'yyyy-MM')
    setEntryCache(prev => {
      const newCache = new Map(prev)
      newCache.delete(monthKey)
      return newCache
    })
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  // Update date ranges when selected date changes
  useEffect(() => {
    const monthStart = startOfMonth(selectedDate)
    const monthEnd = endOfMonth(selectedDate)
    setStartDate(monthStart)
    setEndDate(monthEnd)
  }, [selectedDate])

  useEffect(() => {
    if (session) {
      fetchProjects()
      if (activeTab === 'calendar') {
        fetchTimeEntries(false) // Use cache if available
      } else {
        fetchAllTimeEntries() // For timesheet view, get all entries
      }
    }
  }, [session, selectedDate, activeTab])

  useEffect(() => {
    applyFilters()
  }, [timeEntries, searchTerm, selectedProject, dateRange, sortBy])

  const fetchTimeEntries = async (forceRefresh = false) => {
    const monthKey = format(startOfMonth(selectedDate), 'yyyy-MM')
    
    // Check cache first
    if (!forceRefresh && entryCache.has(monthKey)) {
      const cachedEntries = entryCache.get(monthKey)!
      setTimeEntries(cachedEntries)
      setLoading(false)
      return
    }

    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
      
      const response = await fetch(`/api/time-entries?${params}`)
      const data = await response.json()
      
      setTimeEntries(data)
      
      // Cache the results
      setEntryCache(prev => new Map(prev).set(monthKey, data))
    } catch (error) {
      console.error('Error fetching time entries:', error)
      toast.error('Failed to fetch time entries')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchAllTimeEntries = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/time-entries')
      const data = await response.json()
      setTimeEntries(data)
    } catch (error) {
      console.error('Error fetching time entries:', error)
      toast.error('Failed to fetch time entries')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      setProjects(data.filter((p: Project) => p.active !== false))
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const applyFilters = () => {
    let filtered = [...timeEntries]

    // Date range filter for timesheet view
    if (activeTab === 'timesheet') {
      const now = new Date()
      switch (dateRange) {
        case 'today':
          filtered = filtered.filter(entry => 
            format(parseISO(entry.startTime), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')
          )
          break
        case 'week':
          const weekStart = startOfWeek(now)
          const weekEnd = endOfWeek(now)
          filtered = filtered.filter(entry => 
            isWithinInterval(parseISO(entry.startTime), { start: weekStart, end: weekEnd })
          )
          break
        case 'month':
          const monthStart = subDays(now, 30)
          filtered = filtered.filter(entry => 
            parseISO(entry.startTime) >= monthStart
          )
          break
      }

      // Project filter
      if (selectedProject !== 'all') {
        filtered = filtered.filter(entry => entry.project.id === selectedProject)
      }

      // Search filter
      if (searchTerm) {
        filtered = filtered.filter(entry =>
          entry.project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (entry.description && entry.description.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      }

      // Sort
      switch (sortBy) {
        case 'date-desc':
          filtered.sort((a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime())
          break
        case 'date-asc':
          filtered.sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
          break
        case 'duration-desc':
          filtered.sort((a, b) => (b.duration || 0) - (a.duration || 0))
          break
      }

      setCurrentPage(1)
    }

    setFilteredEntries(filtered)
  }

  // Navigation functions
  const goToPreviousMonth = () => {
    setSelectedDate(prev => subMonths(prev, 1))
  }

  const goToNextMonth = () => {
    setSelectedDate(prev => addMonths(prev, 1))
  }

  const goToCurrentMonth = () => {
    setSelectedDate(new Date())
  }

  const handleForceRefresh = async () => {
    // Clear cache for current month
    const monthKey = format(startOfMonth(selectedDate), 'yyyy-MM')
    setEntryCache(prev => {
      const newCache = new Map(prev)
      newCache.delete(monthKey)
      return newCache
    })
    
    if (activeTab === 'calendar') {
      await fetchTimeEntries(true)
    } else {
      await fetchAllTimeEntries()
    }
    toast.success('Data refreshed')
  }

  const getEntriesForDate = (date: Date) => {
    return timeEntries.filter(entry => 
      isSameDay(parseISO(entry.startTime), date)
    )
  }

  const getTotalDurationForDate = (date: Date) => {
    const entries = getEntriesForDate(date)
    return entries.reduce((total, entry) => total + (entry.duration || 0), 0)
  }

  const formatHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`
  const formatTime = (dateString: string) => format(parseISO(dateString), 'HH:mm')

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Running...'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getTotalDuration = () => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  }

  const getPaginatedEntries = () => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredEntries.slice(startIndex, endIndex)
  }

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage)

  // Entry management functions
  const handleAddEntry = (date: Date) => {
    if (isEditingRestricted(date)) {
      setAdminAlertMessage(
        `You cannot add entries for ${format(date, 'MMMM yyyy')} after the 15th of the current month. Please contact your administrator for assistance with past entries.`
      )
      setAdminAlertOpen(true)
      return
    }
    
    setEditingEntry(null)
    setFormData({
      projectId: '',
      description: '',
      startTime: '09:00',
      endTime: '17:00',
      duration: 8,
      date: format(date, 'yyyy-MM-dd')
    })
    setEditDialogOpen(true)
  }

  const handleEditEntry = (entry: TimeEntry) => {
    const entryDate = parseISO(entry.startTime)
    
    if (isEditingRestricted(entryDate)) {
      setAdminAlertMessage(
        `You cannot edit entries from ${format(entryDate, 'MMMM yyyy')} after the 15th of the current month. Please contact your administrator for assistance with past entries.`
      )
      setAdminAlertOpen(true)
      return
    }
    
    setEditingEntry(entry)
    const startDate = parseISO(entry.startTime)
    setFormData({
      projectId: entry.project.id,
      description: entry.description || '',
      startTime: format(startDate, 'HH:mm'),
      endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : '',
      duration: entry.duration ? entry.duration / 60 : 0,
      date: format(startDate, 'yyyy-MM-dd')
    })
    setEditDialogOpen(true)
  }

  const handleDeleteEntry = (entry: TimeEntry) => {
    const entryDate = parseISO(entry.startTime)
    
    if (isEditingRestricted(entryDate)) {
      setAdminAlertMessage(
        `You cannot delete entries from ${format(entryDate, 'MMMM yyyy')} after the 15th of the current month. Please contact your administrator for assistance with past entries.`
      )
      setAdminAlertOpen(true)
      return
    }
    
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const entry = timeEntries.find(e => e.id === id)
    if (entry) {
      handleDeleteEntry(entry)
    }
  }

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

        const response = await fetch(`/api/time-entries/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime?.toISOString() || null,
            duration
          })
        })

        if (response.ok) {
          toast.success('Entry updated successfully')
          setEditDialogOpen(false)
          setEditingEntry(null)
          
          // Clear cache and refresh
          clearCacheForDate(entryDate)
          if (activeTab === 'calendar') {
            await fetchTimeEntries(true)
          } else {
            await fetchAllTimeEntries()
          }
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

        const response = await fetch('/api/time-entries/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: formData.projectId === 'none' ? null : formData.projectId,
            description: formData.description,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime?.toISOString() || null,
            duration
          })
        })

        if (response.ok) {
          toast.success('Entry created successfully')
          setEditDialogOpen(false)
          
          // Clear cache and refresh
          clearCacheForDate(entryDate)
          
          if (activeTab === 'calendar') {
            // If the new entry is in current view, refresh
            if (entryDate >= startDate && entryDate <= endDate) {
              await fetchTimeEntries(true)
            } else {
              toast.info(`Entry added for ${format(entryDate, 'MMM dd, yyyy')}. Navigate to that month to see it.`)
            }
          } else {
            await fetchAllTimeEntries()
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

  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return

    try {
      const response = await fetch(`/api/time-entries/${entryToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast.success('Entry deleted successfully')
        setDeleteDialogOpen(false)
        setEntryToDelete(null)
        
        // Clear cache and refresh
        const entryDate = parseISO(entryToDelete.startTime)
        clearCacheForDate(entryDate)
        if (activeTab === 'calendar') {
          await fetchTimeEntries(true)
        } else {
          await fetchAllTimeEntries()
        }
      } else {
        toast.error('Failed to delete entry')
      }
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error('Failed to delete entry')
    }
  }

  // Render monthly calendar
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
                const totalMinutes = getTotalDurationForDate(day)
                const isToday = isSameDay(day, new Date())
                const isCurrentMonth = day >= monthStart && day <= monthEnd
                const isPastRestricted = isEditingRestricted(day)
                
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border rounded-lg p-2 min-h-[120px] transition-colors relative",
                      isToday && "border-blue-500 bg-blue-50",
                      !isCurrentMonth && "opacity-50 bg-gray-50",
                      isCurrentMonth && !isToday && "border-gray-200 hover:bg-gray-50",
                      isPastRestricted && isCurrentMonth && "bg-red-50 border-red-200"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "text-sm font-medium",
                        isToday ? "text-blue-700" : "text-gray-700"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {isPastRestricted && (
                        <div title="Admin approval required for changes"><Shield className="h-3 w-3 text-red-500" /></div>
                      )}
                    </div>
                    
                    {totalMinutes > 0 && (
                      <Badge variant="secondary" className="text-xs mb-1">
                        {formatHours(totalMinutes)}
                      </Badge>
                    )}
                    
                    <div className="space-y-1">
                      {entries.slice(0, 3).map((entry) => (
                        <div
                          key={entry.id}
                          className="text-xs p-1 rounded bg-white border-l-2 cursor-pointer hover:bg-gray-50 group relative"
                          style={{ borderLeftColor: entry.project.color }}
                        >
                          {/* Entry content */}
                          <div onClick={() => handleEditEntry(entry)}>
                            <div className="font-medium truncate pr-6">
                              {entry.project.name}
                            </div>
                            <div className="text-gray-500 truncate">
                              {formatHours(entry.duration || 0)}
                            </div>
                            <div className="text-gray-400 truncate text-[10px]">
                              {formatTime(entry.startTime)} - {entry.endTime ? formatTime(entry.endTime) : 'Running'}
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
                      {entries.length > 3 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{entries.length - 3} more
                        </div>
                      )}
                    </div>
                    
                    {/* Add button - always show for all days, restriction is handled in handleAddEntry */}
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
          )
        })}
      </div>
    )
  }

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!session) {
    return null
  }

  const totalMinutes = activeTab === 'calendar' 
    ? timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
    : getTotalDuration()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Time Tracking</h2>
            <p className="text-gray-600">View and manage your time entries</p>
          </div>
          <Card className="stats-card">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {activeTab === 'calendar' ? timeEntries.length : filteredEntries.length} entries 
                </p>
                <p className="text-2xl font-bold">
                  Total: {activeTab === 'calendar' ? formatHours(totalMinutes) : formatDuration(totalMinutes)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
            <TabsTrigger value="timesheet" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Timesheet View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            {/* Month Navigation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Month Navigation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={goToCurrentMonth}
                    >
                      Current Month
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

            {/* Calendar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Calendar - {format(selectedDate, 'MMMM yyyy')}</span>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                      <span>Admin approval required</span>
                    </div>
                    <span>Click entries to edit • Hover for actions</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderMonthView()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timesheet" className="space-y-4">
            {/* Filters */}
            <Card className="stats-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search entries..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Project Filter */}
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="dropdown-trigger">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent className="dropdown-content">
                      <SelectItem value="all">All Projects</SelectItem>
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

                  {/* Date Range Filter */}
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">Last 30 Days</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Sort Filter */}
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Newest First</SelectItem>
                      <SelectItem value="date-asc">Oldest First</SelectItem>
                      <SelectItem value="duration-desc">Longest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Add Entry Button */}
            <div className="flex justify-end">
              <Button 
                onClick={() => handleAddEntry(new Date())} 
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Entry
              </Button>
            </div>

            {/* Entries List */}
            <Card className="stats-card">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {getPaginatedEntries().map((entry) => (
                    <div key={entry.id} className="time-entry-card p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.project.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-card-foreground">{entry.project.name}</span>
                              <Badge 
                                className={entry.endTime ? 'badge-success' : 'badge-warning'}
                                variant="secondary"
                              >
                                {formatDuration(entry.duration)}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(parseISO(entry.startTime), 'MMM dd, yyyy')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(parseISO(entry.startTime), 'HH:mm')}
                                {entry.endTime && ` - ${format(parseISO(entry.endTime), 'HH:mm')}`}
                              </span>
                            </div>
                            {entry.description && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {entry.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleEditEntry(entry)}
                            className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDelete(entry.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of{' '}
                  {filteredEntries.length} entries
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                  >
                    Previous
                  </Button>
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i
                    if (page <= 0 || page > totalPages) return null
                    return (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredEntries.length === 0 && !loading && (
              <Card className="stats-card">
                <CardContent className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No entries found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || selectedProject !== 'all' 
                      ? 'Try adjusting your filters'
                      : 'Start tracking time to see your entries here'
                    }
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit/Add Entry Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingEntry ? 'Edit Time Entry' : 'Add New Time Entry'}
              </DialogTitle>
              <DialogDescription>
                {editingEntry ? 'Make changes to the time entry below.' : 'Create a new time entry.'}
              </DialogDescription>
              
              {/* Policy Notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 mb-1">Time Entry Policy</p>
                    <p className="text-blue-700">
                      Please log only billable work hours. Do not include break time, lunch periods, or any non-work activities. 
                      Only record time for which you are compensated.
                    </p>
                  </div>
                </div>
              </div>
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
                Are you sure you want to delete this time entry? This action cannot be undone.
                {entryToDelete && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                    <div className="font-medium">{entryToDelete.project.name}</div>
                    <div className="text-gray-600">
                      {formatHours(entryToDelete.duration || 0)} on {format(parseISO(entryToDelete.startTime), 'MMM dd, yyyy')}
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

        {/* Admin Alert Dialog */}
        <AlertDialog open={adminAlertOpen} onOpenChange={setAdminAlertOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Administrator Approval Required
              </AlertDialogTitle>
              <AlertDialogDescription>
                {adminAlertMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>
                Understood
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}