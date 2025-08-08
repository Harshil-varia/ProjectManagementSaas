'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { 
  Loader2, 
  DollarSign, 
  Shield, 
  Edit, 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Plus,
  Check,
  BarChart3,
  Clock,
  Users
} from 'lucide-react'
import { toast } from 'sonner'

// Use the same interface as the project reports page
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

interface BudgetForm {
  totalBudget: string
  q1Budget: string
  q2Budget: string
  q3Budget: string
  q4Budget: string
}

// Use the same utility functions as the project reports page
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

const formatCurrencyWithCents = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

const formatHours = (hours: number) => {
  return `${hours.toFixed(1)}h`
}

// Use the same budget status logic as the project reports page
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
    icon: Check 
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

export default function AdminBudgetsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  // State management - use the same structure as project reports page
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null)
  const [budgetForm, setBudgetForm] = useState<BudgetForm>({
    totalBudget: '',
    q1Budget: '',
    q2Budget: '',
    q3Budget: '',
    q4Budget: ''
  })
  const [updating, setUpdating] = useState(false)

  // Computed values using the same logic as project reports
  const projectsWithBudget = useMemo(() => 
    projects.filter(p => p.totalBudget > 0 || (p.q1Budget + p.q2Budget + p.q3Budget + p.q4Budget) > 0), 
    [projects]
  )

  const projectsWithoutBudget = useMemo(() => 
    projects.filter(p => p.totalBudget === 0 && (p.q1Budget + p.q2Budget + p.q3Budget + p.q4Budget) === 0), 
    [projects]
  )

  const budgetStats = useMemo(() => {
    const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0)
    const totalSpent = projects.reduce((sum, p) => sum + p.totalSpent, 0)
    const overBudget = projects.filter(p => p.budgetUtilization >= 100).length
    const atRisk = projects.filter(p => p.budgetUtilization >= 75 && p.budgetUtilization < 100).length

    return { totalBudget, totalSpent, overBudget, atRisk, projectCount: projects.length }
  }, [projects])

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user?.role !== 'ADMIN') {
      router.push('/calendar')
    }
  }, [session, status, router])

  useEffect(() => {
    if (session && session.user?.role === 'ADMIN') {
      fetchProjectSummaries()
    }
  }, [session])

  // Use the same API endpoint as the project reports page
  const fetchProjectSummaries = async () => {
    try {
      setLoading(true)
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

  // Event handlers
  const handleEditBudget = (project: ProjectSummary) => {
    setEditingProject(project)
    setBudgetForm({
      totalBudget: project.totalBudget.toString(),
      q1Budget: project.q1Budget.toString(),
      q2Budget: project.q2Budget.toString(),
      q3Budget: project.q3Budget.toString(),
      q4Budget: project.q4Budget.toString()
    })
  }

  const handleUpdateBudget = async () => {
    if (!editingProject) return

    // Validate inputs
    const totalBudget = parseFloat(budgetForm.totalBudget) || 0
    const q1Budget = parseFloat(budgetForm.q1Budget) || 0
    const q2Budget = parseFloat(budgetForm.q2Budget) || 0
    const q3Budget = parseFloat(budgetForm.q3Budget) || 0
    const q4Budget = parseFloat(budgetForm.q4Budget) || 0

    if (totalBudget < 0 || q1Budget < 0 || q2Budget < 0 || q3Budget < 0 || q4Budget < 0) {
      toast.error('Budget amounts cannot be negative')
      return
    }

    const quarterlyTotal = q1Budget + q2Budget + q3Budget + q4Budget
    if (quarterlyTotal > totalBudget && totalBudget > 0) {
      toast.error('Quarterly budgets exceed total budget')
      return
    }

    setUpdating(true)

    try {
      const response = await fetch(`/api/budgets/${editingProject.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          totalBudget,
          q1Budget,
          q2Budget,
          q3Budget,
          q4Budget
        }),
      })
      
      if (response.ok) {
        toast.success('Budget updated successfully')
        setEditingProject(null)
        setBudgetForm({
          totalBudget: '',
          q1Budget: '',
          q2Budget: '',
          q3Budget: '',
          q4Budget: ''
        })
        
        // Refresh the data using the same method as project reports
        await fetchProjectSummaries()
        
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update budget')
      }
    } catch (error) {
      console.error('Budget Update Error:', error)
      toast.error('Failed to update budget')
    } finally {
      setUpdating(false)
    }
  }

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

  if (!session || session?.user?.role !== 'ADMIN') {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You need admin privileges to manage budgets.</p>
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
            <h1 className="text-3xl font-bold">Budget Management</h1>
            <p className="text-gray-600">
              Manage quarterly budgets and track spending for projects
            </p>
          </div>
          <Badge variant="destructive" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Only
          </Badge>
        </div>

        {/* Budget Overview - Same as project reports page */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(budgetStats.totalBudget)}
              </div>
              <p className="text-xs text-muted-foreground">
                Across {budgetStats.projectCount} projects
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
                {formatCurrency(budgetStats.totalSpent)}
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
                {budgetStats.overBudget}
              </div>
              <p className="text-xs text-muted-foreground">
                Projects over budget
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">At Risk</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {budgetStats.atRisk}
              </div>
              <p className="text-xs text-muted-foreground">
                Projects at 75%+ budget
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="budgeted" className="space-y-4">
          <TabsList>
            <TabsTrigger value="budgeted" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Projects with Budgets ({projectsWithBudget.length})
            </TabsTrigger>
            <TabsTrigger value="unbudgeted" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Setup Budgets ({projectsWithoutBudget.length})
            </TabsTrigger>
          </TabsList>

          {/* Projects with Budgets - Same table structure as project reports */}
          <TabsContent value="budgeted">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Projects with Budget Tracking ({projectsWithBudget.length})
                </CardTitle>
                <CardDescription>
                  Monitor quarterly budget allocation and spending across all projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : projectsWithBudget.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Budgets Set</h3>
                    <p className="text-gray-600 mb-4">
                      No projects have budgets configured yet. Start by setting up budgets for your projects.
                    </p>
                    <Button onClick={() => (document.querySelector('[value="unbudgeted"]') as HTMLElement)?.click()}>
                      Setup First Budget
                    </Button>
                  </div>
                ) : (
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
                      {projectsWithBudget.map((project) => {
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditBudget(project)}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit Budget
                                </Button>
                                <Link href={`/reports/projects/${project.id}`}>
                                  <Button variant="outline" size="sm">
                                    <BarChart3 className="h-4 w-4 mr-1" />
                                    Report
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects without Budgets */}
          <TabsContent value="unbudgeted">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Setup Project Budgets ({projectsWithoutBudget.length})
                </CardTitle>
                <CardDescription>
                  Configure quarterly budgets for projects that don't have budget tracking enabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : projectsWithoutBudget.length === 0 ? (
                  <div className="text-center py-8">
                    <Check className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">All Projects Have Budgets!</h3>
                    <p className="text-gray-600">
                      Every active project has been configured with budget tracking.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectsWithoutBudget.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="font-medium">{project.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">No Budget Set</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditBudget(project)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Setup Budget
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Budget Dialog */}
        <Dialog open={!!editingProject} onOpenChange={() => setEditingProject(null)}>
          <DialogContent className="max-w-lg">
            {editingProject && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {editingProject.totalBudget > 0 || (editingProject.q1Budget + editingProject.q2Budget + editingProject.q3Budget + editingProject.q4Budget) > 0 ? 'Edit' : 'Setup'} Project Budget
                  </DialogTitle>
                  <DialogDescription>
                    Configure quarterly budget allocation for {editingProject.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalBudget">Total Annual Budget ($)</Label>
                    <Input
                      id="totalBudget"
                      type="number"
                      step="1"
                      min="0"
                      value={budgetForm.totalBudget}
                      onChange={(e) => setBudgetForm(prev => ({ ...prev, totalBudget: e.target.value }))}
                      placeholder="Enter total annual budget"
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="q1Budget">Q1 Budget (Apr-Jun)</Label>
                      <Input
                        id="q1Budget"
                        type="number"
                        step="1"
                        min="0"
                        value={budgetForm.q1Budget}
                        onChange={(e) => setBudgetForm(prev => ({ ...prev, q1Budget: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="q2Budget">Q2 Budget (Jul-Sep)</Label>
                      <Input
                        id="q2Budget"
                        type="number"
                        step="1"
                        min="0"
                        value={budgetForm.q2Budget}
                        onChange={(e) => setBudgetForm(prev => ({ ...prev, q2Budget: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="q3Budget">Q3 Budget (Oct-Dec)</Label>
                      <Input
                        id="q3Budget"
                        type="number"
                        step="1"
                        min="0"
                        value={budgetForm.q3Budget}
                        onChange={(e) => setBudgetForm(prev => ({ ...prev, q3Budget: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="q4Budget">Q4 Budget (Jan-Mar)</Label>
                      <Input
                        id="q4Budget"
                        type="number"
                        step="1"
                        min="0"
                        value={budgetForm.q4Budget}
                        onChange={(e) => setBudgetForm(prev => ({ ...prev, q4Budget: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Budget Summary */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                    <div className="text-sm font-medium">Budget Summary</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Quarterly Total:</span>
                        <span className="font-medium">
                          {formatCurrencyWithCents(
                            (parseFloat(budgetForm.q1Budget) || 0) +
                            (parseFloat(budgetForm.q2Budget) || 0) +
                            (parseFloat(budgetForm.q3Budget) || 0) +
                            (parseFloat(budgetForm.q4Budget) || 0)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Annual Budget:</span>
                        <span className="font-medium">
                          {formatCurrencyWithCents(parseFloat(budgetForm.totalBudget) || 0)}
                        </span>
                      </div>
                      {(() => {
                        const quarterlyTotal = (parseFloat(budgetForm.q1Budget) || 0) +
                                              (parseFloat(budgetForm.q2Budget) || 0) +
                                              (parseFloat(budgetForm.q3Budget) || 0) +
                                              (parseFloat(budgetForm.q4Budget) || 0)
                        const annualBudget = parseFloat(budgetForm.totalBudget) || 0
                        const difference = annualBudget - quarterlyTotal

                        if (Math.abs(difference) > 0.01) {
                          return (
                            <div className={`flex justify-between ${difference < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                              <span>Difference:</span>
                              <span className="font-medium">
                                {formatCurrencyWithCents(difference)}
                              </span>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingProject(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateBudget} disabled={updating}>
                    {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingProject.totalBudget > 0 || (editingProject.q1Budget + editingProject.q2Budget + editingProject.q3Budget + editingProject.q4Budget) > 0 ? 'Update' : 'Setup'} Budget
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}