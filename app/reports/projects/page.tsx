//app/reports/projects/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { 
  Loader2, 
  BarChart3, 
  FolderOpen, 
  Shield, 
  Search,
  DollarSign,
  TrendingUp,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle,
  Download
} from 'lucide-react'
import { toast } from 'sonner'

interface ProjectSummary {
  id: string
  name: string
  description: string | null
  color: string
  active: boolean
  totalBudget: number
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
  q1Spent: number
  q2Spent: number
  q3Spent: number
  q4Spent: number
  totalSpent: number
  totalHours: number
  employeeCount: number
  entryCount: number
  budgetUtilization: number
  lastActivity: string | null
}

export default function AdminProjectReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [filteredProjects, setFilteredProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [budgetFilter, setBudgetFilter] = useState<'all' | 'on-track' | 'warning' | 'critical' | 'over-budget'>('all')

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
      fetchProjectSummaries()
    }
  }, [session])

  useEffect(() => {
    // Apply filters
    let filtered = projects.filter(project => {
      // Search filter
      const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (project.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'active' && project.active) ||
                           (statusFilter === 'inactive' && !project.active)
      
      // Budget filter
      let matchesBudget = true
      if (budgetFilter !== 'all') {
        const utilization = project.budgetUtilization
        switch (budgetFilter) {
          case 'on-track':
            matchesBudget = utilization < 75
            break
          case 'warning':
            matchesBudget = utilization >= 75 && utilization < 90
            break
          case 'critical':
            matchesBudget = utilization >= 90 && utilization < 100
            break
          case 'over-budget':
            matchesBudget = utilization >= 100
            break
        }
      }
      
      return matchesSearch && matchesStatus && matchesBudget
    })

    setFilteredProjects(filtered)
  }, [projects, searchTerm, statusFilter, budgetFilter])

  const fetchProjectSummaries = async () => {
    try {
      const response = await fetch('/api/projects/summaries')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      } else {
        toast.error('Failed to fetch project summaries')
      }
    } catch (error) {
      console.error('Failed to fetch project summaries:', error)
      toast.error('Failed to fetch project summaries')
    } finally {
      setLoading(false)
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
    return `${hours.toFixed(1)}h`
  }

  const getBudgetStatus = (utilization: number) => {
    if (utilization >= 100) return { 
      status: 'Over Budget', 
      color: 'text-red-600', 
      bg: 'bg-red-100',
      variant: 'destructive' as const,
      icon: AlertTriangle 
    }
    if (utilization >= 90) return { 
      status: 'Critical', 
      color: 'text-orange-600', 
      bg: 'bg-orange-100',
      variant: 'destructive' as const,
      icon: AlertTriangle 
    }
    if (utilization >= 75) return { 
      status: 'Warning', 
      color: 'text-yellow-600', 
      bg: 'bg-yellow-100',
      variant: 'secondary' as const,
      icon: AlertTriangle 
    }
    return { 
      status: 'On Track', 
      color: 'text-green-600', 
      bg: 'bg-green-100',
      variant: 'default' as const,
      icon: CheckCircle 
    }
  }

  const getActivityStatus = (lastActivity: string | null) => {
    if (!lastActivity) return 'No Activity'
    
    const daysSince = Math.floor(
      (new Date().getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )
    
    if (daysSince === 0) return 'Today'
    if (daysSince === 1) return 'Yesterday'
    if (daysSince <= 7) return `${daysSince} days ago`
    if (daysSince <= 30) return `${Math.floor(daysSince / 7)} weeks ago`
    return `${Math.floor(daysSince / 30)} months ago`
  }

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
          <p className="text-gray-600">You need admin privileges to access project reports.</p>
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
            <h1 className="text-3xl font-bold">Project Reports</h1>
            <p className="text-gray-600">Detailed productivity and budget reports for all projects</p>
          </div>
          <Badge variant="destructive" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Only
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects.length}</div>
              <p className="text-xs text-muted-foreground">
                {projects.filter(p => p.active).length} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(projects.reduce((sum, p) => sum + p.totalBudget, 0))}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(projects.reduce((sum, p) => sum + p.totalSpent, 0))}
              </div>
              <p className="text-xs text-muted-foreground">
                Current spending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Over Budget</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {projects.filter(p => p.budgetUtilization >= 100).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Projects over budget
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Projects</CardTitle>
            <CardDescription>Find specific projects to view detailed reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={budgetFilter} onValueChange={(value: any) => setBudgetFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Budgets</SelectItem>
                  <SelectItem value="on-track">On Track</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="over-budget">Over Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Project Reports ({filteredProjects.length})
            </CardTitle>
            <CardDescription>
              Click on any project to view detailed productivity and budget reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredProjects.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead>Utilization</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => {
                    const budgetStatus = getBudgetStatus(project.budgetUtilization)
                    const StatusIcon = budgetStatus.icon

                    return (
                      <TableRow key={project.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <div>
                              <div className="font-medium">{project.name}</div>
                              {project.description && (
                                <div className="text-sm text-gray-500 truncate max-w-xs">
                                  {project.description}
                                </div>
                              )}
                            </div>
                            {!project.active && (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatCurrency(project.totalBudget)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatCurrency(project.totalSpent)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <StatusIcon className={`h-4 w-4 ${budgetStatus.color}`} />
                              <Badge variant={budgetStatus.variant}>
                                {budgetStatus.status}
                              </Badge>
                            </div>
                            <div className="w-full">
                              <div className="flex justify-between text-xs mb-1">
                                <span>{project.budgetUtilization.toFixed(1)}%</span>
                                <span>{formatCurrency(project.totalBudget - project.totalSpent)} left</span>
                              </div>
                              <Progress 
                                value={Math.min(project.budgetUtilization, 100)} 
                                className="h-2"
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{formatHours(project.totalHours)}</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {project.entryCount} entries
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-gray-400" />
                            <span>{project.employeeCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {getActivityStatus(project.lastActivity)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Link href={`/reports/projects/${project.id}`}>
                              <Button variant="outline" size="sm">
                                <BarChart3 className="h-4 w-4 mr-1" />
                                View Report
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Projects Found</h3>
                <p className="text-gray-500">
                  {searchTerm || statusFilter !== 'all' || budgetFilter !== 'all'
                    ? 'No projects match your current filters.'
                    : 'No projects have been created yet.'
                  }
                </p>
                {(searchTerm || statusFilter !== 'all' || budgetFilter !== 'all') && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setSearchTerm('')
                      setStatusFilter('all')
                      setBudgetFilter('all')
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}