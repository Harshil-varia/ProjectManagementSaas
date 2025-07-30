'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, AlertTriangle, Clock, Users } from 'lucide-react'
import { format, subDays, isAfter } from 'date-fns'

interface User {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
}

interface UserTimeData {
  user: User
  todayMinutes: number
  weekMinutes: number
  lastEntryDate: string | null
  entriesCount: number
  hasIssues: boolean
}

interface UserOversightProps {
  onSendReminder: (userId: string, issue: string) => void
}

export default function UserOversight({ onSendReminder }: UserOversightProps) {
  const [userData, setUserData] = useState<UserTimeData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/admin/user-oversight')
      const data = await response.json()
      setUserData(data)
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const getIssueType = (user: UserTimeData) => {
    const yesterday = subDays(new Date(), 1)
    const lastWeek = subDays(new Date(), 7)
    
    if (!user.lastEntryDate) return 'No time entries'
    if (isAfter(yesterday, new Date(user.lastEntryDate))) return 'No recent entries'
    if (user.todayMinutes === 0) return 'No time logged today'
    if (user.weekMinutes < 40 * 60) return 'Low weekly hours'
    return null
  }

  const getUsersWithIssues = () => {
    return userData.filter(user => user.hasIssues)
  }

  if (loading) {
    return <div>Loading user oversight data...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Users</p>
                <p className="text-2xl font-bold">{userData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Users with Issues</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {getUsersWithIssues().length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Active Today</p>
                <p className="text-2xl font-bold text-green-600">
                  {userData.filter(u => u.todayMinutes > 0).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Reminders Needed</p>
                <p className="text-2xl font-bold text-purple-600">
                  {getUsersWithIssues().length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {getUsersWithIssues().length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {getUsersWithIssues().length} user(s) need attention regarding their time tracking.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User Time Tracking Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {userData.map((user) => {
              const issue = getIssueType(user)
              
              return (
                <div
                  key={user.user.id}
                  className={`p-4 border rounded-lg ${
                    user.hasIssues ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="font-medium">
                          {user.user.name || user.user.email}
                        </h3>
                        <p className="text-sm text-gray-600">{user.user.email}</p>
                      </div>
                      
                      <Badge variant={user.user.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {user.user.role}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Today: {formatDuration(user.todayMinutes)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Week: {formatDuration(user.weekMinutes)}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Entries: {user.entriesCount}
                        </p>
                        <p className="text-sm text-gray-600">
                          Last: {user.lastEntryDate 
                            ? format(new Date(user.lastEntryDate), 'MMM dd')
                            : 'Never'
                          }
                        </p>
                      </div>
                      
                      {user.hasIssues && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSendReminder(user.user.id, issue || 'General reminder')}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send Reminder
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {issue && (
                    <div className="mt-2">
                      <Badge variant="destructive" className="text-xs">
                        {issue}
                      </Badge>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}