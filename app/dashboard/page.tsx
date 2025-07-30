'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard-layout'
import TimeTracker from '@/components/time-entry/time-tracker'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { BarChart3, Clock, TrendingUp, Calendar, Target, ArrowRight, Plus, Eye, EyeOff } from 'lucide-react'
import { format, parseISO, isToday, isThisWeek, startOfWeek, endOfWeek } from 'date-fns'

interface Project {
  id: string
  name: string
  color: string
  active?: boolean
}

interface TimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  description: string | null
  projectId: string
  project: Project
}

interface DashboardStats {
  todayHours: number
  todayMinutes: number
  weekHours: number
  weekMinutes: number
  activeProjects: number
  completedEntries: number
  topProject: { name: string; color: string; hours: number } | null
}

export default function DashboardPage() {
  const [showAllEntries, setShowAllEntries] = useState(false)
  const [groupByProject, setGroupByProject] = useState(true)
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary')
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      Promise.all([
        fetchProjects(),
        fetchTimeEntries(),
        fetchDashboardStats()
      ]).finally(() => setLoading(false))
    }
  }, [session])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      setProjects(data)
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const fetchTimeEntries = async () => {
    try {
      const response = await fetch('/api/time-entries')
      const data = await response.json()
      setTimeEntries(data)
      
      // Find active entry
      const active = data.find((entry: TimeEntry) => !entry.endTime)
      setActiveEntry(active || null)
    } catch (error) {
      console.error('Error fetching time entries:', error)
    }
  }

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/reports?period=week')
      const data = await response.json()
      
      // Calculate today's time
      const today = new Date().toDateString()
      const todayEntries = timeEntries.filter(entry => {
        return new Date(entry.startTime).toDateString() === today && entry.endTime
      })
      const todayTotal = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
      
      // Calculate this week's time from API
      const weekTotal = data.totalHours * 60 // Convert hours to minutes
      
      // Find top project
      const topProject = data.projectBreakdown.length > 0 
        ? data.projectBreakdown.reduce((max: any, current: any) => 
            current.hours > max.hours ? current : max
          )
        : null

      setDashboardStats({
        todayHours: Math.floor(todayTotal / 60),
        todayMinutes: todayTotal % 60,
        weekHours: Math.floor(weekTotal / 60),
        weekMinutes: Math.floor(weekTotal % 60),
        activeProjects: projects.filter(p => p.active).length,
        completedEntries: data.entries.length,
        topProject: topProject ? {
          name: topProject.name,
          color: topProject.color,
          hours: topProject.hours
        } : null
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    }
  }

 

  // Enhanced statistics calculations
  const completedEntries = timeEntries.filter(entry => entry.endTime)
  const todayEntries = completedEntries.filter(entry => isToday(parseISO(entry.startTime)))
  const weekEntries = completedEntries.filter(entry => isThisWeek(parseISO(entry.startTime)))
  
  const todayMinutes = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  const weekMinutes = weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  
  const todayHours = todayMinutes / 60
  const weekHours = weekMinutes / 60
  const averageDailyHours = weekHours / 7

  // Recent projects for quick actions
  const getRecentProjects = () => {
    const recentProjectIds = timeEntries
      .slice(0, 10)
      .map(entry => entry.projectId)
    const uniqueProjectIds = [...new Set(recentProjectIds)]
    return uniqueProjectIds
      .map(id => projects.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 3) as Project[]
  }




  // Top projects calculation
  const getTopProjects = () => {
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
    
    return Object.values(projectStats)
      .sort((a: any, b: any) => b.duration - a.duration)
      .slice(0, 5)
  }

  const formatHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
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

  const recentProjects = getRecentProjects()
  const topProjects = getTopProjects()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Welcome, {session.user?.name || 'User'}!</h2>
            <p className="text-gray-600">Here's your time tracking overview</p>
          </div>
          <div className="flex gap-2">
            <Link href="/calendar">
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Time Sheet
              </Button>
            </Link>
            {session?.user?.role === 'ADMIN' && (
                <Link href="/reports">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Button>
            </Link>
              )}
            
          </div>
        </div>
        
        {/* Enhanced Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Today's Progress */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {formatHours(todayMinutes)}
              </div>
              <Progress value={(todayHours / 8) * 100} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((todayHours / 8) * 100)}% of 8h target
              </p>
            </CardContent>
          </Card>

          {/* Week Progress */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 ">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatHours(weekMinutes)}
              </div>
              <Progress value={(weekHours / 40) * 100} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((weekHours / 40) * 100)}% of 40h target
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
              <div className="text-2xl font-bold text-orange-600">
                {projects.filter(p => p.active !== false).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Projects this week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Timer and Quick Actions */}
          
          {/* Quick Start Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Quick Start
              </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Start timing your recent projects
                  </p>
                  <div className="pt-2 border-t">
                    <Link href="/calendar">
                      <Button variant="outline" className="w-full ">
                        <Calendar className="h-4 w-4 mr-2" />
                        Add Entry
                      </Button>
                    </Link>
                  </div>
                </div>  
            </CardContent>
          </Card>

        {/* Top Projects This Week */}
        {topProjects.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Top Projects This Week</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode(viewMode === 'summary' ? 'detailed' : 'summary')}
                >
                  {viewMode === 'summary' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProjects.slice(0, viewMode === 'summary' ? 3 : 5).map((projectData: any, index) => {
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
        )}
      </div>
    </DashboardLayout>
  )
}