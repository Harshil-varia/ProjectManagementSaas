'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, BarChart3, DollarSign, Clock, Download, TrendingUp, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface EmployeeData {
  id: string
  name: string | null
  email: string
  rate: number
  monthlyHours: Record<string, number> // 'YYYY-MM' -> hours
  monthlySpending: Record<string, number> // 'YYYY-MM' -> spending
  quarterlyHours: { q1: number; q2: number; q3: number; q4: number }
  quarterlySpending: { q1: number; q2: number; q3: number; q4: number }
  totalHours: number
  totalSpending: number
}

interface ProjectReportData {
  project: {
    id: string
    name: string
    color: string
  }
  period: {
    year: number
    startDate: string
    endDate: string
  }
  budget: {
    q1Budget: number
    q2Budget: number
    q3Budget: number
    q4Budget: number
    totalBudget: number
    q1Spent: number
    q2Spent: number
    q3Spent: number
    q4Spent: number
    totalSpent: number
  }
  employees: EmployeeData[]
  totals: {
    monthlyHours: Record<string, number>
    monthlySpending: Record<string, number>
    quarterlyHours: { q1: number; q2: number; q3: number; q4: number }
    quarterlySpending: { q1: number; q2: number; q3: number; q4: number }
    totalHours: number
    totalSpending: number
  }
  months: string[] // ['2025-04', '2025-05', '2025-06', ...]
}

export default function EnhancedProjectReportPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  
  const [reportData, setReportData] = useState<ProjectReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (session && projectId) {
      fetchReportData()
    }
  }, [session, projectId, selectedYear])

  const fetchReportData = async () => {
    if (!projectId) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        format: 'detailed'
      })

      const response = await fetch(`/api/projects/${projectId}/detailed`)
      
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      } else if (response.status === 403) {
        toast.error('You do not have permission to view this project\'s reports')
        router.push('/dashboard')
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

  const handleExport = async (format: 'csv' | 'excel' = 'excel') => {
    if (!projectId) return

    setExporting(true)
    try {
      const params = new URLSearchParams({
        format,
        year: selectedYear.toString(),
        type: 'detailed'
      })

      const response = await fetch(`/api/reports/project/${projectId}/export?${params}`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${reportData?.project.name}_${selectedYear}_detailed_report.${format === 'excel' ? 'xlsx' : 'csv'}`
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

  const getQuarterLabel = (quarter: 'q1' | 'q2' | 'q3' | 'q4') => {
    const labels = {
      q1: 'Q1 (Apr-Jun)',
      q2: 'Q2 (Jul-Sep)',
      q3: 'Q3 (Oct-Dec)',
      q4: 'Q4 (Jan-Mar)'
    }
    return labels[quarter]
  }

  const getBudgetStatus = (spent: number, budget: number) => {
    if (budget === 0) return { status: 'N/A', color: 'text-gray-500', percentage: 0 }
    const percentage = (spent / budget) * 100
    
    if (percentage > 100) {
      return { 
        status: `Over Budget`, 
        color: 'text-red-600', 
        percentage,
        variance: spent - budget
      }
    } else {
      return { 
        status: `${percentage.toFixed(1)}% of Budget`, 
        color: percentage > 90 ? 'text-orange-600' : percentage > 75 ? 'text-yellow-600' : 'text-green-600', 
        percentage,
        variance: budget - spent
      }
    }
  }

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (!session) {
    router.push('/login')
    return null
  }

  if (!reportData) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Report Data</h2>
          <p className="text-gray-600">Unable to load report data for this project.</p>
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
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: reportData.project.color }}
              />
              {reportData.project.name} - Productivity Report
            </h1>
            <p className="text-gray-600">
              Fiscal {selectedYear}/{selectedYear + 1} YEAR 1
            </p>
          </div>
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
        </div>

        {/* Year Selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Fiscal Year:</label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - 2 + i
                    return (
                      <SelectItem key={year} value={year.toString()}>
                        FY {year}/{year + 1}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Report Tables */}
        <Tabs defaultValue="hours" className="space-y-4">
          <TabsList>
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="dollars">Dollars</TabsTrigger>
            <TabsTrigger value="budget">Budget Summary</TabsTrigger>
          </TabsList>

          {/* Hours Table */}
          <TabsContent value="hours">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  HOURS
                </CardTitle>
                <CardDescription>Hours worked by employee per month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 bg-green-100 font-bold">HOURS</TableHead>
                        <TableHead className="bg-green-100 font-bold">EMPLOYEE</TableHead>
                        {/* Q1 Months */}
                        <TableHead className="text-center bg-blue-50">APR</TableHead>
                        <TableHead className="text-center bg-blue-50">MAY</TableHead>
                        <TableHead className="text-center bg-blue-50">JUN</TableHead>
                        <TableHead className="text-center bg-blue-100 font-bold">Total Q1</TableHead>
                        {/* Q2 Months */}
                        <TableHead className="text-center bg-yellow-50">JUL</TableHead>
                        <TableHead className="text-center bg-yellow-50">AUG</TableHead>
                        <TableHead className="text-center bg-yellow-50">SEP</TableHead>
                        <TableHead className="text-center bg-yellow-100 font-bold">Total Q2</TableHead>
                        {/* Q3 Months */}
                        <TableHead className="text-center bg-orange-50">OCT</TableHead>
                        <TableHead className="text-center bg-orange-50">NOV</TableHead>
                        <TableHead className="text-center bg-orange-50">DEC</TableHead>
                        <TableHead className="text-center bg-orange-100 font-bold">Total Q3</TableHead>
                        {/* Q4 Months */}
                        <TableHead className="text-center bg-purple-50">JAN</TableHead>
                        <TableHead className="text-center bg-purple-50">FEB</TableHead>
                        <TableHead className="text-center bg-purple-50">MAR</TableHead>
                        <TableHead className="text-center bg-purple-100 font-bold">Total Q4</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.employees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="bg-green-50 font-medium text-center">
                            {formatHours(employee.totalHours)}
                          </TableCell>
                          <TableCell className="bg-green-50 font-medium">
                            {employee.name || employee.email}
                          </TableCell>
                          {/* Q1 */}
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-04`] ? formatHours(employee.monthlyHours[`${selectedYear}-04`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-05`] ? formatHours(employee.monthlyHours[`${selectedYear}-05`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-06`] ? formatHours(employee.monthlyHours[`${selectedYear}-06`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center bg-blue-100 font-bold">
                            {formatHours(employee.quarterlyHours.q1)}
                          </TableCell>
                          {/* Q2 */}
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-07`] ? formatHours(employee.monthlyHours[`${selectedYear}-07`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-08`] ? formatHours(employee.monthlyHours[`${selectedYear}-08`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-09`] ? formatHours(employee.monthlyHours[`${selectedYear}-09`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center bg-yellow-100 font-bold">
                            {formatHours(employee.quarterlyHours.q2)}
                          </TableCell>
                          {/* Q3 */}
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-10`] ? formatHours(employee.monthlyHours[`${selectedYear}-10`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-11`] ? formatHours(employee.monthlyHours[`${selectedYear}-11`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear}-12`] ? formatHours(employee.monthlyHours[`${selectedYear}-12`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center bg-orange-100 font-bold">
                            {formatHours(employee.quarterlyHours.q3)}
                          </TableCell>
                          {/* Q4 */}
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear + 1}-01`] ? formatHours(employee.monthlyHours[`${selectedYear + 1}-01`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear + 1}-02`] ? formatHours(employee.monthlyHours[`${selectedYear + 1}-02`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlyHours[`${selectedYear + 1}-03`] ? formatHours(employee.monthlyHours[`${selectedYear + 1}-03`]) : '-'}
                          </TableCell>
                          <TableCell className="text-center bg-purple-100 font-bold">
                            {formatHours(employee.quarterlyHours.q4)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell className="bg-green-100">{formatHours(reportData.totals.totalHours)}</TableCell>
                        <TableCell className="bg-green-100">TOTAL</TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-04`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-04`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-05`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-05`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-06`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-06`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center bg-blue-200">{formatHours(reportData.totals.quarterlyHours.q1)}</TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-07`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-07`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-08`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-08`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-09`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-09`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center bg-yellow-200">{formatHours(reportData.totals.quarterlyHours.q2)}</TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-10`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-10`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-11`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-11`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear}-12`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear}-12`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center bg-orange-200">{formatHours(reportData.totals.quarterlyHours.q3)}</TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear + 1}-01`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear + 1}-01`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear + 1}-02`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear + 1}-02`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlyHours[`${selectedYear + 1}-03`] ? formatHours(reportData.totals.monthlyHours[`${selectedYear + 1}-03`]) : '-'}
                        </TableCell>
                        <TableCell className="text-center bg-purple-200">{formatHours(reportData.totals.quarterlyHours.q4)}</TableCell>
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
                <CardDescription>Spending by employee per month (Hours × Rate)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 bg-green-100 font-bold">DOLLARS</TableHead>
                        <TableHead className="bg-green-100 font-bold">EMPLOYEE</TableHead>
                        {/* Q1 Months */}
                        <TableHead className="text-center bg-blue-50">APR</TableHead>
                        <TableHead className="text-center bg-blue-50">MAY</TableHead>
                        <TableHead className="text-center bg-blue-50">JUN</TableHead>
                        <TableHead className="text-center bg-blue-100 font-bold">Total Q1</TableHead>
                        {/* Q2 Months */}
                        <TableHead className="text-center bg-yellow-50">JUL</TableHead>
                        <TableHead className="text-center bg-yellow-50">AUG</TableHead>
                        <TableHead className="text-center bg-yellow-50">SEP</TableHead>
                        <TableHead className="text-center bg-yellow-100 font-bold">Total Q2</TableHead>
                        {/* Q3 Months */}
                        <TableHead className="text-center bg-orange-50">OCT</TableHead>
                        <TableHead className="text-center bg-orange-50">NOV</TableHead>
                        <TableHead className="text-center bg-orange-50">DEC</TableHead>
                        <TableHead className="text-center bg-orange-100 font-bold">Total Q3</TableHead>
                        {/* Q4 Months */}
                        <TableHead className="text-center bg-purple-50">JAN</TableHead>
                        <TableHead className="text-center bg-purple-50">FEB</TableHead>
                        <TableHead className="text-center bg-purple-50">MAR</TableHead>
                        <TableHead className="text-center bg-purple-100 font-bold">Total Q4</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.employees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="bg-green-50 font-medium text-center">
                            {employee.rate > 0 ? formatCurrency(employee.totalSpending) : '#N/A'}
                          </TableCell>
                          <TableCell className="bg-green-50 font-medium">
                            {employee.name || employee.email}
                          </TableCell>
                          {/* Q1 */}
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-04`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-04`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-05`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-05`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-06`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-06`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center bg-blue-100 font-bold">
                            {employee.rate > 0 ? formatCurrency(employee.quarterlySpending.q1) : '#N/A'}
                          </TableCell>
                          {/* Q2 */}
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-07`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-07`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-08`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-08`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-09`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-09`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center bg-yellow-100 font-bold">
                            {employee.rate > 0 ? formatCurrency(employee.quarterlySpending.q2) : '#N/A'}
                          </TableCell>
                          {/* Q3 */}
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-10`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-10`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-11`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-11`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear}-12`] ? formatCurrency(employee.monthlySpending[`${selectedYear}-12`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center bg-orange-100 font-bold">
                            {employee.rate > 0 ? formatCurrency(employee.quarterlySpending.q3) : '#N/A'}
                          </TableCell>
                          {/* Q4 */}
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear + 1}-01`] ? formatCurrency(employee.monthlySpending[`${selectedYear + 1}-01`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear + 1}-02`] ? formatCurrency(employee.monthlySpending[`${selectedYear + 1}-02`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center">
                            {employee.monthlySpending[`${selectedYear + 1}-03`] ? formatCurrency(employee.monthlySpending[`${selectedYear + 1}-03`]) : (employee.rate > 0 ? '-' : '#N/A')}
                          </TableCell>
                          <TableCell className="text-center bg-purple-100 font-bold">
                            {employee.rate > 0 ? formatCurrency(employee.quarterlySpending.q4) : '#N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell className="bg-green-100">
                          {reportData.totals.totalSpending > 0 ? formatCurrency(reportData.totals.totalSpending) : '#N/A'}
                        </TableCell>
                        <TableCell className="bg-green-100">TOTAL SALARY</TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-04`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-04`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-05`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-05`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-06`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-06`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center bg-blue-200">
                          {reportData.totals.quarterlySpending.q1 > 0 ? formatCurrency(reportData.totals.quarterlySpending.q1) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-07`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-07`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-08`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-08`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-09`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-09`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center bg-yellow-200">
                          {reportData.totals.quarterlySpending.q2 > 0 ? formatCurrency(reportData.totals.quarterlySpending.q2) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-10`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-10`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-11`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-11`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear}-12`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear}-12`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center bg-orange-200">
                          {reportData.totals.quarterlySpending.q3 > 0 ? formatCurrency(reportData.totals.quarterlySpending.q3) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear + 1}-01`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear + 1}-01`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear + 1}-02`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear + 1}-02`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center">
                          {reportData.totals.monthlySpending[`${selectedYear + 1}-03`] ? formatCurrency(reportData.totals.monthlySpending[`${selectedYear + 1}-03`]) : '#N/A'}
                        </TableCell>
                        <TableCell className="text-center bg-purple-200">
                          {reportData.totals.quarterlySpending.q4 > 0 ? formatCurrency(reportData.totals.quarterlySpending.q4) : '#N/A'}
                        </TableCell>
                      </TableRow>
                      {/* Other Costs Row */}
                      <TableRow>
                        <TableCell className="bg-green-50">-</TableCell>
                        <TableCell className="bg-green-50">OTHER COSTS</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center bg-blue-100">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center bg-yellow-100">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center bg-orange-100">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center">-</TableCell>
                        <TableCell className="text-center bg-purple-100">-</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Budget Summary */}
          <TabsContent value="budget">
            <div className="space-y-6">
              {/* Budget vs Actual Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {(['q1', 'q2', 'q3', 'q4'] as const).map((quarter) => {
                  const budget = reportData.budget[`${quarter}Budget`]
                  const spent = reportData.budget[`${quarter}Spent`]
                  const status = getBudgetStatus(spent, budget)
                  
                  return (
                    <Card key={quarter}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{getQuarterLabel(quarter)}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Budget:</span>
                            <span className="font-medium">{formatCurrency(budget)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Spent:</span>
                            <span className="font-medium">{formatCurrency(spent)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Status:</span>
                            <span className={`font-medium ${status.color}`}>
                              {status.status}
                            </span>
                          </div>
                          {status.variance !== undefined && (
                            <div className="flex justify-between text-sm">
                              <span>{spent > budget ? 'Over by:' : 'Remaining:'}</span>
                              <span className={`font-medium ${spent > budget ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(Math.abs(status.variance))}
                              </span>
                            </div>
                          )}
                        </div>
                        {budget > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Utilization</span>
                              <span>{status.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  status.percentage > 100 ? 'bg-red-500' : 
                                  status.percentage > 90 ? 'bg-orange-500' : 
                                  status.percentage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(status.percentage, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Budget Summary Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Budget Summary</CardTitle>
                  <CardDescription>Complete budget breakdown and variance analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead className="text-right">Budget Total</TableHead>
                        <TableHead className="text-right">Q1 Budget</TableHead>
                        <TableHead className="text-right">Q2 Budget</TableHead>
                        <TableHead className="text-right">Q3 Budget</TableHead>
                        <TableHead className="text-right">Q4 Budget</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Allocated Budget</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(reportData.budget.totalBudget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q1Budget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q2Budget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q3Budget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q4Budget)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Actual Spent</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(reportData.budget.totalSpent)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q1Spent)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q2Spent)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q3Spent)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(reportData.budget.q4Spent)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Variance</TableCell>
                        <TableCell className={`text-right font-medium ${
                          reportData.budget.totalSpent > reportData.budget.totalBudget ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {reportData.budget.totalBudget > 0 
                            ? formatCurrency(reportData.budget.totalBudget - reportData.budget.totalSpent)
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className={`text-right ${
                          reportData.budget.q1Spent > reportData.budget.q1Budget ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {reportData.budget.q1Budget > 0 
                            ? formatCurrency(reportData.budget.q1Budget - reportData.budget.q1Spent)
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className={`text-right ${
                          reportData.budget.q2Spent > reportData.budget.q2Budget ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {reportData.budget.q2Budget > 0 
                            ? formatCurrency(reportData.budget.q2Budget - reportData.budget.q2Spent)
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className={`text-right ${
                          reportData.budget.q3Spent > reportData.budget.q3Budget ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {reportData.budget.q3Budget > 0 
                            ? formatCurrency(reportData.budget.q3Budget - reportData.budget.q3Spent)
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className={`text-right ${
                          reportData.budget.q4Spent > reportData.budget.q4Budget ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {reportData.budget.q4Budget > 0 
                            ? formatCurrency(reportData.budget.q4Budget - reportData.budget.q4Spent)
                            : '#N/A'
                          }
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Utilization %</TableCell>
                        <TableCell className="text-right font-medium">
                          {reportData.budget.totalBudget > 0 
                            ? `${((reportData.budget.totalSpent / reportData.budget.totalBudget) * 100).toFixed(1)}%`
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {reportData.budget.q1Budget > 0 
                            ? `${((reportData.budget.q1Spent / reportData.budget.q1Budget) * 100).toFixed(1)}%`
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {reportData.budget.q2Budget > 0 
                            ? `${((reportData.budget.q2Spent / reportData.budget.q2Budget) * 100).toFixed(1)}%`
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {reportData.budget.q3Budget > 0 
                            ? `${((reportData.budget.q3Spent / reportData.budget.q3Budget) * 100).toFixed(1)}%`
                            : '#N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {reportData.budget.q4Budget > 0 
                            ? `${((reportData.budget.q4Spent / reportData.budget.q4Budget) * 100).toFixed(1)}%`
                            : '#N/A'
                          }
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}