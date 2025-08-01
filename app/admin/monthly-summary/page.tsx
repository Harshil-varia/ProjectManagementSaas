//app/admin/monthly-summary/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Loader2, 
  Shield, 
  Download, 
  Calculator,
  Users,
  DollarSign,
  Clock,
  Search,
  Calendar,
  FileText
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { toast } from 'sonner'

interface EmployeeProjectSummary {
  employeeId: string
  employeeName: string | null
  employeeEmail: string
  employeeRate: number
  projectId: string
  projectName: string
  projectCode: string | null
  aggregatedHours: number
  totalCost: number
}

interface MonthlySummaryData {
  month: string
  year: number
  summaries: EmployeeProjectSummary[]
  totals: {
    totalHours: number
    totalCost: number
    employeeCount: number
    projectCount: number
  }
}

export default function MonthlyEmployeeSummaryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [summaryData, setSummaryData] = useState<MonthlySummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState('all')
  
  // Available projects for filtering
  const [projects, setProjects] = useState<Array<{id: string, name: string, color: string}>>([])

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/calendar')
    }
  }, [session, status, router])

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchMonthlySummary()
      fetchProjects()
    }
  }, [session, selectedDate])

  const fetchMonthlySummary = async () => {
    try {
      setLoading(true)
      const year = selectedDate.getFullYear()
      const month = selectedDate.getMonth() + 1
      
      const response = await fetch(`/api/admin/monthly-summary?year=${year}&month=${month}`)
      if (response.ok) {
        const data = await response.json()
        setSummaryData(data)
      } else {
        toast.error('Failed to fetch monthly summary')
      }
    } catch (error) {
      console.error('Failed to fetch monthly summary:', error)
      toast.error('Failed to fetch monthly summary')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.filter((p: any) => p.active))
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const handleExport = async (format: 'csv' | 'excel' = 'excel') => {
    if (!summaryData) return

    setExporting(true)
    try {
      const year = selectedDate. getFullYear()
      const month = selectedDate.getMonth() + 1
      
      const params = new URLSearchParams({
        format,
        year: year.toString(),
        month: month.toString(),
        type: 'accounting'
      })

      const response = await fetch(`/api/admin/monthly-summary/export?${params}`, {
        method: 'GET',
        headers: {
          'Accept': format === 'excel' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv'
        }
      })
      
      if (response.ok) {
        const blob = await response.blob()
        
        // Create download link
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `Monthly_Employee_Summary_.${format === 'excel' ? 'xlsx' : 'csv'}`
        
        // Append to body, click, and remove
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Clean up
        window.URL.revokeObjectURL(url)
        
        toast.success(`${format.toUpperCase()} report exported successfully`)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(`Failed to export report: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Failed to export report:', error)
      toast.error('Failed to export report. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const formatHours = (hours: number) => {
    return hours.toFixed(2)
  }

  // Filter summaries based on search and project filter
  const filteredSummaries = summaryData?.summaries.filter(summary => {
    const matchesSearch = summary.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         summary.employeeEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         summary.projectName.toLowerCase().includes(searchTerm.toLowerCase())
                         
    
    const matchesProject = selectedProject === 'all' || summary.projectId === selectedProject
    
    return matchesSearch && matchesProject
  }) || []

  // Group filtered summaries by employee for better readability
  const groupedSummaries = filteredSummaries.reduce((groups, summary) => {
    const key = summary.employeeId
    if (!groups[key]) {
      groups[key] = {
        employee: {
          id: summary.employeeId,
          name: summary.employeeName,
          email: summary.employeeEmail,
          rate: summary.employeeRate
        },
        projects: [],
        totalHours: 0,
        totalCost: 0
      }
    }
    
    groups[key].projects.push({
      projectId: summary.projectId,
      projectName: summary.projectName,
      projectCode: summary.projectCode,
      hours: summary.aggregatedHours,
      cost: summary.totalCost
    })
    
    groups[key].totalHours += summary.aggregatedHours
    groups[key].totalCost += summary.totalCost
    
    return groups
  }, {} as any)

  // Loading and access control
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
          <p className="text-gray-600">You need admin privileges to access monthly summaries.</p>
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
            <h1 className="text-3xl font-bold">Monthly Employee Summary</h1>
            <p className="text-gray-600">
              Employee hours and costs by project for accounting purposes
            </p>
          </div>
          <Badge variant="destructive" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Only
          </Badge>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Select Month & Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              {/* Month/Year Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Month</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDate(subMonths(selectedDate, 1))}
                  >
                    ←
                  </Button>
                  <div className="min-w-[120px] text-center py-2 px-3 border rounded">
                    {format(selectedDate, 'MMM yyyy')}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDate(addMonths(selectedDate, 1))}
                  >
                    →
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search employees or projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Project Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleExport('excel')}
                  disabled={exporting || !summaryData}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('csv')}
                  disabled={exporting || !summaryData}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {summaryData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatHours(summaryData.totals.totalHours)}
                </div>
                <p className="text-xs text-muted-foreground">
                  For {format(selectedDate, 'MMMM yyyy')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(summaryData.totals.totalCost)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Labor costs
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryData.totals.employeeCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryData.totals.projectCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  With activity
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Employee Summary - {format(selectedDate, 'MMMM yyyy')}
            </CardTitle>
            <CardDescription>
              Hours and costs by employee and project for accounting software import
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : Object.keys(groupedSummaries).length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Data Found</h3>
                <p className="text-gray-500">
                  No time entries found for the selected month and filters.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Project Code</TableHead>
                    <TableHead>Project Name</TableHead>
                    <TableHead className="text-right">Aggregated Hours</TableHead>
                    <TableHead className="text-right">Hourly Rate</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(groupedSummaries).map((employeeSummary: any) => (
                    employeeSummary.projects.map((project: any, index: number) => (
                      <TableRow key={`${employeeSummary.employee.id}-${project.projectId}`}>
                        <TableCell>
                          {index === 0 ? (
                            <div>
                              <div className="font-medium">
                                {employeeSummary.employee.name || 'N/A'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {employeeSummary.employee.email}
                              </div>
                              {employeeSummary.projects.length > 1 && (
                                <Badge variant="secondary" className="mt-1">
                                  {employeeSummary.projects.length} projects
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-sm">
                              ↳ Same employee
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {project.projectCode || project.projectId.slice(0, 8)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{project.projectName}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatHours(project.hours)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(employeeSummary.employee.rate)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(project.cost)}
                        </TableCell>
                      </TableRow>
                    ))
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}