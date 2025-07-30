'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Clock, TrendingUp, Target, Calendar } from 'lucide-react'
import { format, parseISO, isToday, isThisWeek, startOfWeek, endOfWeek } from 'date-fns'

interface TimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  project: {
    id: string
    name: string
    desc: string
    color: string
  }
}

interface TimeStatisticsProps {
  timeEntries: TimeEntry[]
}

export default function TimeStatistics({ timeEntries }: TimeStatisticsProps) {
  const completedEntries = timeEntries.filter(entry => entry.endTime)
  
  // Calculate statistics
  const todayEntries = completedEntries.filter(entry => isToday(parseISO(entry.startTime)))
  const weekEntries = completedEntries.filter(entry => isThisWeek(parseISO(entry.startTime)))
  
  const todayMinutes = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  const weekMinutes = weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  
  const todayHours = todayMinutes / 60
  const weekHours = weekMinutes / 60
  const averageDailyHours = weekHours / 7
  
  // Top projects this week
  const projectStats = weekEntries.reduce((acc, entry) => {
    const projectId = entry.project.id
    if (!acc[projectId]) {
      acc[projectId] = {
        project: entry.project,
        duration: 0,
        entries: 0
      }
    }
    acc[projectId].duration += entry.duration || 0
    acc[projectId].entries += 1
    return acc
  }, {} as Record<string, any>)
  
  const topProjects = Object.values(projectStats)
    .sort((a: any, b: any) => b.duration - a.duration)
    .slice(0, 5)

  const formatHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getProgressColor = (hours: number, target: number) => {
    const percentage = (hours / target) * 100
    if (percentage >= 100) return 'bg-green-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Today's Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Hours</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatHours(todayMinutes)}</div>
          <Progress value={(todayHours / 8) * 100} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round((todayHours / 8) * 100)}% of 8h target
          </p>
        </CardContent>
      </Card>

      {/* Week Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">This Week</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatHours(weekMinutes)}</div>
          <Progress value={(weekHours / 40) * 100} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round((weekHours / 40) * 100)}% of 40h target
          </p>
        </CardContent>
      </Card>

      {/* Daily Average */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatHours(averageDailyHours * 60)}</div>
          <p className="text-xs text-muted-foreground">
            Based on this week
          </p>
        </CardContent>
      </Card>

      {/* Active Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{topProjects.length}</div>
          <p className="text-xs text-muted-foreground">
            This week
          </p>
        </CardContent>
      </Card>

      {/* Top Projects */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle>Top Projects This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topProjects.slice(0, 5).map((projectData: any, index) => {
              const percentage = weekMinutes > 0 ? (projectData.duration / weekMinutes) * 100 : 0
              return (
                <div key={projectData.project.id} className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="text-sm font-medium text-gray-500 w-4">
                      {index + 1}
                    </span>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: projectData.project.color }}
                    />
                    <span className="font-medium">{projectData.project.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                      {formatHours(projectData.duration)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {percentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}