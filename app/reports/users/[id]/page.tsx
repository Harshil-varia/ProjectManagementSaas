// app/reports/users/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, BarChart3, DollarSign, Clock, Download, CalendarIcon, Users } from 'lucide-react'
import { format, startOfYear, endOfYear } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface User {
  id: string
  name: string | null
  email: string
  role: string
}

interface UserSummaryData {
  user: {
    id: string
    name: string | null
    email: string
    rate: number
  }
  period: {
    startDate: string
    endDate: string
  }
  projects: Array<{
    id: string
    name: string
    color: string
    monthlyHours: Record<string, number>
    monthlySpending: Record<string, number>
    totalHours: number
    totalSpending: number
  }>
  totals: {
    monthlyHours: Record<string, number>
    monthlySpending: Record<string, number>
    totalHours: number
    totalSpending: number
  }
  months: string[]
}

export default function UserSummaryReportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  
  const [users, setUsers] = useState<User[]>([])
  const [reportData, setReportData] = useState<UserSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [fetchingUsers, setFetchingUsers] = useState(false)
  
  // Date range state
  const [startDate, setStartDate] = useState<Date>(startOfYear(new Date()))
  const [endDate, setEndDate] = useState<Date>(endOfYear(new Date()))
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)

  // Authentication check
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  // Fetch users list
  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchUsers()
    }
  }, [session])

  // Fetch report data when userId or date range changes
  useEffect(() => {
    if (session && session.user.role === 'ADMIN' && userId && startDate && endDate) {
      fetchReportData()
    }
  }, [session, userId, startDate, endDate])

  const fetchUsers = async () => {
    setFetchingUsers(true)
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        toast.error('Failed to fetch users list')
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      toast.error('Failed to fetch users list')
    } finally {
      setFetchingUsers(false)
    }
  }

  const fetchReportData = async () => {
    if (!userId || !startDate || !endDate) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })

      const response = await fetch(`/api/users/${userId}/summary?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      } else if (response.status === 403) {
        toast.error('You do not have permission to view this user\'s reports')
        router.push('/reports')
      } else if (response.status === 404) {
        toast.error('User not found')
        router.push('/reports')
      } else {
        toast.error('Failed to fetch report data')
      }
    } catch (error) {
      console.error('Failed to fetch report data:', error)
      toast.error('Failed to fetch report data')
    } finally {
      setLoading(false)
    }
  }

  const handleUserChange = (newUserId: string) => {
    if (newUserId && newUserId !== userId) {
      // Navigate to the new user's report page with current date range
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
      router.push(`/reports/users/${newUserId}?${params}`)
    }
  }

  const handleExport = async (exportFormat: 'csv' | 'excel' = 'excel') => {
    if (!userId || !startDate || !endDate) return

    setExporting(true)
    try {
      const params = new URLSearchParams({
        format: exportFormat,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })

      const response = await fetch(`/api/users/${userId}/export?${params}`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportData?.user.name || reportData?.user.email}_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}_summary.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('Report exported successfully')
      } else {
        toast.error('Failed to export report')
      }
    } catch (error) {
      console.error('Failed to export report:', error)
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatHours = (hours: number) => {
    return hours.toFixed(1)
  }

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return format(date, 'MMM')
  }

  const handleDateRangeQuickSelect = (type: 'thisYear' | 'lastYear') => {
    const now = new Date()
    switch (type) {
      case 'thisYear':
        setStartDate(startOfYear(now))
        setEndDate(endOfYear(now))
        break
      case 'lastYear':
        const lastYear = new Date(now.getFullYear() - 1, 0, 1)
        setStartDate(startOfYear(lastYear))
        setEndDate(endOfYear(lastYear))
        break
    }
  }

  // Loading state
  if (status === 'loading' || (loading && !reportData)) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  // Access denied
  if (!session || session.user.role !== 'ADMIN') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to access user reports.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              {reportData ? `USER: ${reportData.user.name || reportData.user.email} - Summary Report` : 'User Summary Report'}
            </h1>
            {reportData && (
              <p className="text-gray-600 flex items-center gap-2">
                <span>{reportData.user.email}</span>
                <Badge variant="outline">
                  {reportData.user.rate > 0 ? `${formatCurrency(reportData.user.rate)}/hr` : 'No Rate Set'}
                </Badge>
              </p>
            )}
          </div>
          {reportData && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleExport('excel')}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          )}
        </div>

        {/* User Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Selection
            </CardTitle>
            <CardDescription>Select a user for detailed reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <Select value={userId || ''} onValueChange={handleUserChange} disabled={fetchingUsers}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder={fetchingUsers ? "Loading users..." : "Select a user to view reports"} />
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
                {fetchingUsers && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Range Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Date Range Selection</CardTitle>
            <CardDescription>Select the date range for the report</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        if (date) {
                          setStartDate(date)
                          setStartDateOpen(false)
                        }
                      }}
                      disabled={(date) => date > new Date() || (endDate && date > endDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-gray-500">to</span>

                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => {
                        if (date) {
                          setEndDate(date)
                          setEndDateOpen(false)
                        }
                      }}
                      disabled={(date) => date > new Date() || (startDate && date < startDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDateRangeQuickSelect('thisYear')}>
                  This Year
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDateRangeQuickSelect('lastYear')}>
                  Last Year
                </Button>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              Selected Range: {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
            </div>
          </CardContent>
        </Card>

        {/* Show loading state while fetching report data */}
        {loading && reportData === null && userId && (
          <Card>
            <CardContent className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading report data...</p>
            </CardContent>
          </Card>
        )}

        {/* Show message when no user is selected */}
        {!userId && (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Select a User</h2>
              <p className="text-gray-600">Choose a user from the dropdown above to view their summary report.</p>
            </CardContent>
          </Card>
        )}

        {/* Report content - only show if we have data and userId */}
        {reportData && userId && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatHours(reportData.totals.totalHours)}</div>
                  <p className="text-xs text-muted-foreground">
                    {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd, yyyy')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {reportData.user.rate > 0 ? formatCurrency(reportData.totals.totalSpending) : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Based on hourly rate
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{reportData.projects.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Projects worked on
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Report Tables */}
            <Tabs defaultValue="hours" className="space-y-4">
              <TabsList>
                <TabsTrigger value="hours">Hours</TabsTrigger>
                <TabsTrigger value="dollars">Dollars</TabsTrigger>
              </TabsList>

              {/* Hours Table */}
              <TabsContent value="hours">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      HOURS
                    </CardTitle>
                    <CardDescription>Hours worked on each project by month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20 bg-green-100 font-bold">HOURS</TableHead>
                            <TableHead className="bg-green-100 font-bold">PROJECT</TableHead>
                            {reportData.months.map((month) => (
                              <TableHead key={month} className="text-center bg-blue-50">
                                {getMonthName(month)}
                              </TableHead>
                            ))}
                            <TableHead className="text-center bg-gray-100 font-bold">TOTAL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.projects.map((project) => (
                            <TableRow key={project.id}>
                              <TableCell className="bg-green-50 font-medium text-center">
                                {formatHours(project.totalHours)}
                              </TableCell>
                              <TableCell className="bg-green-50 font-medium">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: project.color }}
                                  />
                                  {project.name}
                                </div>
                              </TableCell>
                              {reportData.months.map((month) => (
                                <TableCell key={month} className="text-center">
                                  {project.monthlyHours[month] ? formatHours(project.monthlyHours[month]) : '-'}
                                </TableCell>
                              ))}
                              <TableCell className="text-center bg-gray-100 font-bold">
                                {formatHours(project.totalHours)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Total Row */}
                          <TableRow className="bg-gray-100 font-bold">
                            <TableCell className="bg-green-100">{formatHours(reportData.totals.totalHours)}</TableCell>
                            <TableCell className="bg-green-100">TOTAL</TableCell>
                            {reportData.months.map((month) => (
                              <TableCell key={month} className="text-center">
                                {reportData.totals.monthlyHours[month] ? formatHours(reportData.totals.monthlyHours[month]) : '-'}
                              </TableCell>
                            ))}
                            <TableCell className="text-center bg-gray-200">{formatHours(reportData.totals.totalHours)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Dollars Table */}
              <TabsContent value="dollars">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      DOLLARS
                    </CardTitle>
                    <CardDescription>Earnings from each project by month (Hours × Rate)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20 bg-green-100 font-bold">DOLLARS</TableHead>
                            <TableHead className="bg-green-100 font-bold">PROJECT</TableHead>
                            {reportData.months.map((month) => (
                              <TableHead key={month} className="text-center bg-blue-50">
                                {getMonthName(month)}
                              </TableHead>
                            ))}
                            <TableHead className="text-center bg-gray-100 font-bold">TOTAL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.projects.map((project) => (
                            <TableRow key={project.id}>
                              <TableCell className="bg-green-50 font-medium text-center">
                                {reportData.user.rate > 0 ? formatCurrency(project.totalSpending) : '#N/A'}
                              </TableCell>
                              <TableCell className="bg-green-50 font-medium">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: project.color }}
                                  />
                                  {project.name}
                                </div>
                              </TableCell>
                              {reportData.months.map((month) => (
                                <TableCell key={month} className="text-center">
                                  {project.monthlySpending[month] ? 
                                    formatCurrency(project.monthlySpending[month]) : 
                                    (reportData.user.rate > 0 ? '-' : '#N/A')
                                  }
                                </TableCell>
                              ))}
                              <TableCell className="text-center bg-gray-100 font-bold">
                                {reportData.user.rate > 0 ? formatCurrency(project.totalSpending) : '#N/A'}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Total Row */}
                          <TableRow className="bg-gray-100 font-bold">
                            <TableCell className="bg-green-100">
                              {reportData.user.rate > 0 ? formatCurrency(reportData.totals.totalSpending) : '#N/A'}
                            </TableCell>
                            <TableCell className="bg-green-100">TOTAL SALARY</TableCell>
                            {reportData.months.map((month) => (
                              <TableCell key={month} className="text-center">
                                {reportData.totals.monthlySpending[month] ? 
                                  formatCurrency(reportData.totals.monthlySpending[month]) : 
                                  '#N/A'
                                }
                              </TableCell>
                            ))}
                            <TableCell className="text-center bg-gray-200">
                              {reportData.user.rate > 0 ? formatCurrency(reportData.totals.totalSpending) : '#N/A'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Empty State */}
            {reportData.projects.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No data for selected period</h3>
                  <p className="text-gray-500 mb-4">
                    {reportData.user.name || reportData.user.email} has no time entries for the selected date range.
                  </p>
                  <div className="text-sm text-gray-400">
                    Selected Range: {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}