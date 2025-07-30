'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, BarChart3, Clock, Calendar, Users, Shield, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns'

interface User {
  id: string
  name: string | null
  email: string
  role: string
}

interface ReportData {
  totalHours: number
  projectBreakdown: Array<{ name: string; color: string; hours: number }>
  dailyBreakdown: Array<{ date: string; hours: number }>
  entries: Array<{
    id: string
    start: string
    end: string | null
    duration: number
    project: { name: string; color: string } | null
    user: { email: string; name: string | null }
    description: string | null
  }>
}

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [weekDays, setWeekDays] = useState<Date[]>([])

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  // Calculate week days when currentWeek changes
  useEffect(() => {
    const start = startOfWeek(currentWeek, { weekStartsOn: 1 })
    const end = endOfWeek(currentWeek, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start, end })
    setWeekDays(days)
  }, [currentWeek])

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchUsers()
    }
  }, [session])

  useEffect(() => {
    if (selectedUser) {
      fetchReports()
    }
  }, [selectedUser, period, currentWeek])

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

  const fetchReports = async () => {
    if (!selectedUser) return

    setLoading(true)
    try {
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
      
      const params = new URLSearchParams({
        period,
        userId: selectedUser,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString()
      })
      
      const response = await fetch(`/api/reports?${params}`)
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      } else {
        console.error('Failed to fetch reports:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatHours = (hours: number) => `${hours.toFixed(1)}h`
  
  const goToPreviousWeek = () => setCurrentWeek(prev => subWeeks(prev, 1))
  const goToNextWeek = () => setCurrentWeek(prev => addWeeks(prev, 1))
  const goToCurrentWeek = () => setCurrentWeek(new Date())

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

  const selectedUserData = users.find(u => u.id === selectedUser)
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })

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
            <h1 className="text-3xl font-bold">Admin Reports</h1>
            <p className="text-gray-600">View detailed time tracking reports for all users</p>
          </div>
          <Badge variant="default" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Only
          </Badge>
        </div>

        {/* User Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Selection
            </CardTitle>
            <CardDescription>Select a user to view their time tracking report</CardDescription>
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
                <Button onClick={fetchReports} variant="outline">
                  Refresh Data
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedUser && selectedUserData && (
          <>
            {/* Selected User Info */}
            <Card>
              <CardHeader>
                <CardTitle>Report for: {selectedUserData.name || selectedUserData.email}</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span>{selectedUserData.email}</span>
                  <Badge variant={selectedUserData.role === 'ADMIN' ? 'default' : 'secondary'}>
                    {selectedUserData.role}
                  </Badge>
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Week Navigation */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Weekly Calendar View
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
                      Current Week
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToNextWeek}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {format(weekStart, 'MMM dd')} - {format(weekEnd, 'MMM dd, yyyy')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-2">
                    {/* Day headers */}
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <div key={day} className="text-center font-medium p-2 text-sm text-gray-600">
                        {day}
                      </div>
                    ))}
                    
                    {/* Calendar days */}
                    {weekDays.map((day) => {
                      const entries = getEntriesForDate(day)
                      const totalHours = getTotalDurationForDate(day)
                      const isToday = isSameDay(day, new Date())
                      
                      return (
                        <div
                          key={day.toISOString()}
                          className={`border rounded-lg p-2 min-h-[120px] ${
                            isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-medium ${
                              isToday ? 'text-blue-700' : 'text-gray-700'
                            }`}>
                              {format(day, 'd')}
                            </span>
                          </div>
                          
                          {totalHours > 0 && (
                            <Badge variant="secondary" className="text-xs mb-2">
                              {formatHours(totalHours)}
                            </Badge>
                          )}
                          
                          <div className="space-y-1">
                            {entries.slice(0, 3).map((entry) => (
                              <div
                                key={entry.id}
                                className="text-xs p-1 rounded bg-gray-100"
                                style={{ borderLeft: `3px solid ${entry.project?.color || '#gray'}` }}
                              >
                                <div className="font-medium truncate">
                                  {entry.project?.name || 'No Project'}
                                </div>
                                <div className="text-gray-600 truncate">
                                  {entry.description || 'No description'}
                                </div>
                                <div className="text-gray-500">
                                  {formatHours(entry.duration)}
                                </div>
                              </div>
                            ))}
                            {entries.length > 3 && (
                              <div className="text-xs text-gray-500 text-center">
                                +{entries.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary Cards */}
            {reportData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Hours (Week)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatHours(reportData.totalHours)}</div>
                    <p className="text-xs text-muted-foreground">
                      {format(weekStart, 'MMM dd')} - {format(weekEnd, 'MMM dd')}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
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
                  <CardDescription>Time spent on each project this week</CardDescription>
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

            {/* Detailed Entries */}
            {reportData && reportData.entries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Time Entries</CardTitle>
                  <CardDescription>All time entries for the selected week</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reportData.entries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.project?.color || '#gray' }}
                          />
                          <div>
                            <p className="font-medium">{entry.project?.name || 'No Project'}</p>
                            {entry.description && (
                              <p className="text-sm text-gray-600">{entry.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatHours(entry.duration)}</p>
                          <p className="text-sm text-gray-500">
                            {format(parseISO(entry.start), 'MMM dd, HH:mm')}
                            {entry.end && ` - ${format(parseISO(entry.end), 'HH:mm')}`}
                          </p>
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
                  <h3 className="text-lg font-medium mb-2">No data for this week</h3>
                  <p className="text-gray-500">
                    {selectedUserData.name || selectedUserData.email} has no time entries for the selected week.
                  </p>
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
                Choose a user from the dropdown above to view their detailed time tracking report.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}