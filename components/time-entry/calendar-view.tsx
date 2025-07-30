'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Plus, Clock, Eye, EyeOff } from 'lucide-react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns'

interface TimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  description: string | null
  project: {
    id: string
    name: string
    description?: string | null
    color: string
  }
}

interface CalendarViewProps {
  timeEntries: TimeEntry[]
  onAddEntry: (date: Date) => void
  onEditEntry: (entry: TimeEntry) => void
}

type ViewMode = 'compact' | 'detailed' | 'summary'

export default function CalendarView({ timeEntries, onAddEntry, onEditEntry }: CalendarViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [weekDays, setWeekDays] = useState<Date[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('detailed')
  const [selectedProject, setSelectedProject] = useState<string>('all')

  useEffect(() => {
    const start = startOfWeek(currentWeek, { weekStartsOn: 1 })
    const end = endOfWeek(currentWeek, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start, end })
    setWeekDays(days)
  }, [currentWeek])

  const goToPreviousWeek = () => setCurrentWeek(prev => subWeeks(prev, 1))
  const goToNextWeek = () => setCurrentWeek(prev => addWeeks(prev, 1))
  const goToCurrentWeek = () => setCurrentWeek(new Date())

  const getEntriesForDate = (date: Date) => {
    let entries = timeEntries.filter(entry => 
      isSameDay(parseISO(entry.startTime), date)
    )
    
    if (selectedProject !== 'all') {
      entries = entries.filter(entry => entry.project.id === selectedProject)
    }
    
    return entries.filter(entry => entry.endTime) // Only completed entries
  }

  const getProjectsForDate = (date: Date) => {
    const entries = getEntriesForDate(date)
    const projectMap = new Map()
    
    entries.forEach(entry => {
      const projectId = entry.project.id
      if (projectMap.has(projectId)) {
        projectMap.get(projectId).duration += entry.duration || 0
        projectMap.get(projectId).entries.push(entry)
      } else {
        projectMap.set(projectId, {
          project: entry.project,
          duration: entry.duration || 0,
          entries: [entry]
        })
      }
    })
    
    return Array.from(projectMap.values()).sort((a, b) => b.duration - a.duration)
  }

  const getAllProjects = () => {
    const projectMap = new Map()
    timeEntries.forEach(entry => {
      if (!projectMap.has(entry.project.id)) {
        projectMap.set(entry.project.id, entry.project)
      }
    })
    return Array.from(projectMap.values())
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  const formatTime = (timeString: string) => {
    return format(parseISO(timeString), 'HH:mm')
  }

  const renderCompactView = (date: Date) => {
    const projects = getProjectsForDate(date)
    const totalMinutes = projects.reduce((sum, p) => sum + p.duration, 0)
    
    return (
      <div className="space-y-1">
        {projects.slice(0, 4).map((projectData) => (
          <div
            key={projectData.project.id}
            className="flex items-center justify-between p-1 rounded text-xs hover:bg-gray-100 cursor-pointer"
            style={{ borderLeft: `3px solid ${projectData.project.color}` }}
            onClick={() => onEditEntry(projectData.entries[0])}
          >
            <span className="truncate font-medium" title={projectData.project.name}>
              {projectData.project.name}
            </span>
            <Badge variant="secondary" className="text-xs ml-1">
              {formatDuration(projectData.duration)}
            </Badge>
          </div>
        ))}
        {projects.length > 4 && (
          <div className="text-xs text-gray-500 text-center py-1">
            +{projects.length - 4} more projects
          </div>
        )}
      </div>
    )
  }

  const renderSummaryView = (date: Date) => {
    const projects = getProjectsForDate(date)
    const totalMinutes = projects.reduce((sum, p) => sum + p.duration, 0)
    
    if (projects.length === 0) {
      return <div className="text-xs text-gray-400 text-center py-4">No entries</div>
    }
    
    return (
      <div className="space-y-2">
        <div className="text-center">
          <div className="text-sm font-semibold">{formatDuration(totalMinutes)}</div>
          <div className="text-xs text-gray-500">{projects.length} projects</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {projects.map((projectData) => (
            <div
              key={projectData.project.id}
              className="w-3 h-3 rounded-full cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: projectData.project.color }}
              title={`${projectData.project.name}: ${formatDuration(projectData.duration)}`}
              onClick={() => onEditEntry(projectData.entries[0])}
            />
          ))}
        </div>
      </div>
    )
  }

  const renderDetailedView = (date: Date) => {
    const entries = getEntriesForDate(date)
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
    
    return (
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {entries.slice(0, 6).map((entry) => (
          <div
            key={entry.id}
            className="text-xs p-1 rounded cursor-pointer hover:bg-gray-100"
            style={{ borderLeft: `2px solid ${entry.project.color}` }}
            onClick={() => onEditEntry(entry)}
          >
            <div className="flex justify-between items-start">
              <span className="font-medium truncate">{entry.project.name}</span>
              <span className="text-gray-500 ml-1">{formatDuration(entry.duration || 0)}</span>
            </div>
            <div className="text-gray-600">
              {formatTime(entry.startTime)} - {entry.endTime ? formatTime(entry.endTime) : '...'}
            </div>
          </div>
        ))}
        {entries.length > 6 && (
          <div className="text-xs text-gray-500 text-center">
            +{entries.length - 6} more entries
          </div>
        )}
      </div>
    )
  }

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Calendar View
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {getAllProjects().map((project) => (
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
            
            <Select value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
              <SelectTrigger className="w-30" >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
            
            
            <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
              Current
            </Button>
            <Button variant="outline" size="sm" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          {format(weekStart, 'MMM dd')} - {format(weekEnd, 'MMM dd, yyyy')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="pt-6 grid grid-cols-7 gap-2">
          {/* Day headers */}
          {weekDays.map((day, index) => (
            <div key={index} className="text-center font-medium p-2 text-sm text-gray-600 border-b">
              <div>{format(day, 'EEE')}</div>
              <div className="text-xs text-gray-500">{format(day, 'dd')}</div>
            </div>
          ))}
          
          {/* Calendar days */}
          {weekDays.map((day) => {
            const entries = getEntriesForDate(day)
            const totalMinutes = entries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
            const isToday = isSameDay(day, new Date())
            
            return (
              <div
                key={day.toISOString()}
                className={`border rounded-lg p-2 ${
                  viewMode === 'summary' ? 'min-h-[100px]' : 
                  viewMode === 'compact' ? 'min-h-[140px]' : 'min-h-[180px]'
                } ${isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    {totalMinutes > 0 && (
                      <Badge variant="secondary" className="text-xs mb-1">
                        {formatDuration(totalMinutes)}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={() => onAddEntry(day)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                
                {viewMode === 'summary' && renderSummaryView(day)}
                {viewMode === 'compact' && renderCompactView(day)}
                {viewMode === 'detailed' && renderDetailedView(day)}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}