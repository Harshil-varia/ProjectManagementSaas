'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Filter, Download, Calendar, Clock, Edit, Trash2, List } from 'lucide-react'
import { format, parseISO, isWithinInterval, subDays, startOfWeek, endOfWeek } from 'date-fns'
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
  const [filteredEntries, setFilteredEntries] = useState<TimeEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showManualForm, setShowManualForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('calendar')
  
  // Filters for timesheet view
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState('all')
  const [dateRange, setDateRange] = useState('week')
  const [sortBy, setSortBy] = useState('date-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)

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

  useEffect(() => {
    applyFilters()
  }, [timeEntries, searchTerm, selectedProject, dateRange, sortBy])

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

  const applyFilters = () => {
    let filtered = [...timeEntries]

    // Date range filter
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

    setFilteredEntries(filtered)
    setCurrentPage(1)
  }

  const getPaginatedEntries = () => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredEntries.slice(startIndex, endIndex)
  }

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage)

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Running...'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getTotalDuration = () => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  }

  const handleAddEntry = (date: Date) => {
    setSelectedDate(date)
    setEditingEntry(null)
    setShowManualForm(true)
  }

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry)
    setSelectedDate(null)
    setShowManualForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this time entry?')) {
      return
    }

    try {
      const response = await fetch(`/api/time-entries/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setTimeEntries(entries => entries.filter(entry => entry.id !== id))
      }
    } catch (error) {
      console.error('Error deleting time entry:', error)
    }
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

      if (editingEntry) {
        // Update existing entry
        const response = await fetch(`/api/time-entries/${editingEntry.id}`, {
          method: 'PUT',
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
          setEditingEntry(null)
        }
      } else {
        // Create new entry
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
      }
    } catch (error) {
      console.error('Error saving entry:', error)
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Time Tracking</h2>
            <p className="text-gray-600">View and manage your time entries</p>
          </div>
          
        </div>
          <Card className="stats-card">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    {filteredEntries.length} entries 
                  </p>
                  <p className="text-2xl font-bold">
                    Total: {formatDuration(getTotalDuration())}
                  </p>
                </div>
              </CardContent>
            </Card>
        {showManualForm && (
          <ManualEntryForm
            projects={projects}
            selectedDate={selectedDate || undefined}
            initialData={editingEntry ? {
              projectId: editingEntry.project.id,
              projectName: editingEntry.project.name,
              projectColor: editingEntry.project.color,
              description: editingEntry.description || '',
              startTime: format(parseISO(editingEntry.startTime), 'HH:mm'),
              endTime: editingEntry.endTime ? format(parseISO(editingEntry.endTime), 'HH:mm') : '',
              date: format(parseISO(editingEntry.startTime), 'yyyy-MM-dd')
            } : undefined}
            onSubmit={handleSubmitManualEntry}
            onCancel={() => {
              setShowManualForm(false)
              setSelectedDate(null)
              setEditingEntry(null)
            }}
            isEditing={!!editingEntry}
            lockedProject={editingEntry ? {
              id: editingEntry.project.id,
              name: editingEntry.project.name,
              color: editingEntry.project.color
            } : undefined}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
            <TabsTrigger value="timesheet" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Timesheet View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            <CalendarView
              timeEntries={timeEntries}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDelete}
            />
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
                                <Calendar className="h-3 w-3" />
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
      </div>
    </DashboardLayout>
  )
}