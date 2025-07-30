'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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
  X,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'

interface Project {
  id: string
  name: string
  color: string
  totalBudget: number
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
  q1Spent: number
  q2Spent: number
  q3Spent: number
  q4Spent: number
  active: boolean
}

interface BudgetForm {
  totalBudget: string
  q1Budget: string
  q2Budget: string
  q3Budget: string
  q4Budget: string
}

// ✅ FIXED: Safe utility functions matching the detailed report page
const safeNumber = (value: any): number => {
  const num = Number(value)
  return isFinite(num) && !isNaN(num) ? num : 0
}

const formatCurrency = (amount: any): string => {
  const safeAmount = safeNumber(amount)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeAmount)
}

const formatCurrencyWithCents = (amount: any): string => {
  const safeAmount = safeNumber(amount)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeAmount)
}

const getBudgetUtilization = (spent: any, budget: any): number => {
  const safeSpent = safeNumber(spent)
  const safeBudget = safeNumber(budget)
  
  if (safeBudget <= 0) return safeSpent > 0 ? 999 : 0 // Cap at 999% for display
  
  const utilization = (safeSpent / safeBudget) * 100
  return Math.min(utilization, 999) // Cap at 999% to prevent UI issues
}

// ✅ FIXED: Match the budget status logic from the detailed report
const getBudgetStatus = (utilization: number) => {
  if (utilization >= 100) return { 
    color: 'text-red-600', 
    bg: 'bg-red-100', 
    label: 'Over Budget',
    variant: 'destructive' as const
  }
  if (utilization >= 90) return { 
    color: 'text-red-500', 
    bg: 'bg-red-50', 
    label: 'Critical',
    variant: 'destructive' as const
  }
  if (utilization >= 75) return { 
    color: 'text-yellow-600', 
    bg: 'bg-yellow-50', 
    label: 'Warning',
    variant: 'secondary' as const
  }
  return { 
    color: 'text-green-600', 
    bg: 'bg-green-50', 
    label: 'On Track',
    variant: 'secondary' as const
  }
}

const getTotalSpent = (project: Project): number => {
  return safeNumber(project.q1Spent) + 
         safeNumber(project.q2Spent) + 
         safeNumber(project.q3Spent) + 
         safeNumber(project.q4Spent)
}

const getTotalBudget = (project: Project): number => {
  return safeNumber(project.q1Budget) + 
         safeNumber(project.q2Budget) + 
         safeNumber(project.q3Budget) + 
         safeNumber(project.q4Budget)
}

const hasBudgetSet = (project: Project): boolean => {
  return getTotalBudget(project) > 0 || safeNumber(project.totalBudget) > 0
}

export default function AdminBudgetsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  // State management
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [budgetForm, setBudgetForm] = useState<BudgetForm>({
    totalBudget: '',
    q1Budget: '',
    q2Budget: '',
    q3Budget: '',
    q4Budget: ''
  })
  const [updating, setUpdating] = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())

  // Computed values
  const projectsWithBudget = useMemo(() => 
    allProjects.filter(hasBudgetSet), 
    [allProjects]
  )

  const projectsWithoutBudget = useMemo(() => 
    allProjects.filter(p => !hasBudgetSet(p)), 
    [allProjects]
  )

  const budgetStats = useMemo(() => {
    const projects = projectsWithBudget
    const totalBudget = projects.reduce((sum, p) => sum + getTotalBudget(p), 0)
    const totalSpent = projects.reduce((sum, p) => sum + getTotalSpent(p), 0)
    const overBudget = projects.filter(p => 
      getBudgetUtilization(getTotalSpent(p), getTotalBudget(p)) >= 100
    ).length
    const atRisk = projects.filter(p => {
      const util = getBudgetUtilization(getTotalSpent(p), getTotalBudget(p))
      return util >= 75 && util < 100
    }).length

    return { totalBudget, totalSpent, overBudget, atRisk, projectCount: projects.length }
  }, [projectsWithBudget])

  // Effects
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchProjects()
    }
  }, [session])

  // API functions
  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects?include=budget')
      if (response.ok) {
        const data = await response.json()
        setAllProjects(Array.isArray(data) ? data : [])
      } else {
        toast.error('Failed to fetch projects')
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      toast.error('Failed to fetch projects')
    } finally {
      setLoading(false)
    }
  }

  const refreshData = async () => {
    try {
      setRefreshing(true)
      const response = await fetch('/api/projects?include=budget&_t=' + Date.now()) // Add timestamp to prevent caching
      if (response.ok) {
        const data = await response.json()
        setAllProjects(Array.isArray(data) ? data : [])
        console.log('Projects refreshed:', data?.length || 0, 'projects loaded')
      } else {
        console.error('Failed to refresh projects:', response.status)
        toast.error('Failed to refresh projects')
      }
    } catch (error) {
      console.error('Error refreshing projects:', error)
      toast.error('Failed to refresh projects')
    } finally {
      setRefreshing(false)
    }
  }


  
  // Event handlers
  const handleEditBudget = (project: Project) => {
    setEditingProject(project)
    setBudgetForm({
      totalBudget: safeNumber(project.totalBudget).toString(),
      q1Budget: safeNumber(project.q1Budget).toString(),
      q2Budget: safeNumber(project.q2Budget).toString(),
      q3Budget: safeNumber(project.q3Budget).toString(),
      q4Budget: safeNumber(project.q4Budget).toString()
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
    console.log('Updating budget for project:', editingProject.id)

    try {
      // ✅ IMPROVED: Use direct API call with better error handling
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

      console.log('Budget API Response status:', response.status)
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('Budget API Success Response:', responseData)
        
        // ✅ IMPROVED: Immediately update state with the new values
        setAllProjects(prev => {
          const updated = prev.map(p => 
            p.id === editingProject.id 
              ? { 
                  ...p, 
                  totalBudget,
                  q1Budget,
                  q2Budget,
                  q3Budget,
                  q4Budget,
                  // Preserve existing spent values or use from response
                  q1Spent: responseData.project?.q1Spent ?? p.q1Spent,
                  q2Spent: responseData.project?.q2Spent ?? p.q2Spent,
                  q3Spent: responseData.project?.q3Spent ?? p.q3Spent,
                  q4Spent: responseData.project?.q4Spent ?? p.q4Spent
                }
              : p
          )
          console.log('State updated. New project data:', updated.find(p => p.id === editingProject.id))
          return updated
        })

        toast.success('Budget updated successfully')
        setEditingProject(null)
        setBudgetForm({
          totalBudget: '',
          q1Budget: '',
          q2Budget: '',
          q3Budget: '',
          q4Budget: ''
        })
        
        // ✅ IMPROVED: Delayed refresh to ensure database consistency
        setTimeout(async () => {
          console.log('Performing delayed refresh to sync with database...')
          await refreshData()
        }, 1000)
        
      } else {
        const error = await response.json()
        console.error('Budget API Error Response:', error)
        toast.error(error.error || 'Failed to update budget')
      }
    } catch (error) {
      console.error('Budget Update Error:', error)
      toast.error('Failed to update budget')
    } finally {
      setUpdating(false)
    }
  }

  const handleSelectProject = (projectId: string) => {
    const newSelection = new Set(selectedProjectIds)
    if (newSelection.has(projectId)) {
      newSelection.delete(projectId)
    } else {
      newSelection.add(projectId)
    }
    setSelectedProjectIds(newSelection)
  }

  const handleBulkEditSelected = () => {
    if (selectedProjectIds.size === 0) {
      toast.error('Please select at least one project')
      return
    }
    // Could implement bulk edit functionality here
    toast.info('Bulk edit functionality coming soon')
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

  if (!session || session.user.role !== 'ADMIN') {
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
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshData}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {process.env.NODE_ENV === 'development' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={async () => {
                  try {
                    console.log('Testing API endpoints...')
                    
                    // Test 1: General projects endpoint
                    const response1 = await fetch('/api/projects?debug=true&_t=' + Date.now())
                    const data1 = await response1.json()
                    console.log('1. General Projects API:', data1)
                    
                    // Test 2: Projects with budget details
                    const response2 = await fetch('/api/projects?include=budget&detailed=true&_t=' + Date.now())
                    const data2 = await response2.json()
                    console.log('2. Projects with Budget API:', data2)
                    
                    // Test 3: If we have projects, test individual project detail
                    if (allProjects.length > 0) {
                      const firstProject = allProjects[0]
                      const response3 = await fetch(`/api/projects/${firstProject.id}/detailed?_t=${Date.now()}`)
                      const data3 = await response3.json()
                      console.log('3. Individual Project Detail API:', data3)
                    }
                    
                    alert(`API tests complete. ${Array.isArray(data1) ? data1.length : 'non-array'} projects from general API, ${Array.isArray(data2) ? data2.length : 'non-array'} from budget API. Check console for details.`)
                  } catch (error) {
                    console.error('API Test failed:', error)
                    alert('API test failed - check console')
                  }
                }}
              >
                Test All APIs
              </Button>
            )}
            <Badge variant="destructive" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Admin Only
            </Badge>
          </div>
        </div>

        {/* Debug Info (remove in production) */}
        {process.env.NODE_ENV === 'development' && editingProject && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-sm text-blue-800">Current Project Debug</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-blue-700 space-y-1">
              <div>Project: {editingProject.name}</div>
              <div>Total Budget: {formatCurrency(editingProject.totalBudget)}</div>
              <div>Q1: Budget {formatCurrency(editingProject.q1Budget)} | Spent {formatCurrency(editingProject.q1Spent)}</div>
              <div>Q2: Budget {formatCurrency(editingProject.q2Budget)} | Spent {formatCurrency(editingProject.q2Spent)}</div>
              <div>Q3: Budget {formatCurrency(editingProject.q3Budget)} | Spent {formatCurrency(editingProject.q3Spent)}</div>
              <div>Q4: Budget {formatCurrency(editingProject.q4Budget)} | Spent {formatCurrency(editingProject.q4Spent)}</div>
              <div>Total Spent: {formatCurrency(getTotalSpent(editingProject))}</div>
              <div>Utilization: {getBudgetUtilization(getTotalSpent(editingProject), getTotalBudget(editingProject)).toFixed(1)}%</div>
            </CardContent>
          </Card>
        )}

        {/* Debug Info (remove in production) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-sm text-yellow-800">Debug Info</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-yellow-700">
              <div>Total Projects: {allProjects.length}</div>
              <div>Projects with Budget: {projectsWithBudget.length}</div>
              <div>Projects without Budget: {projectsWithoutBudget.length}</div>
              <div>Last Update: {new Date().toLocaleTimeString()}</div>
              <div>Refreshing: {refreshing ? 'Yes' : 'No'}</div>
              <div>Loading: {loading ? 'Yes' : 'No'}</div>
            </CardContent>
          </Card>
        )}

        {/* Budget Overview - Only show if there are projects with budgets */}
        {projectsWithBudget.length > 0 && (
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
        )}

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

          {/* Projects with Budgets */}
          <TabsContent value="budgeted">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Projects with Budget Tracking
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
                    <Button onClick={() => document.querySelector('[value="unbudgeted"]')?.click()}>
                      Setup First Budget
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Total Budget</TableHead>
                        <TableHead>Total Spent</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Utilization</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectsWithBudget.map((project) => {
                        const totalBudget = getTotalBudget(project)
                        const totalSpent = getTotalSpent(project)
                        const remaining = Math.max(0, totalBudget - totalSpent)
                        const utilization = getBudgetUtilization(totalSpent, totalBudget)
                        const status = getBudgetStatus(utilization)

                        return (
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
                              <span className="font-medium">{formatCurrency(totalBudget)}</span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{formatCurrency(totalSpent)}</span>
                            </TableCell>
                            <TableCell>
                              <span className={remaining > 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatCurrency(remaining)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-2 min-w-[120px]">
                                <div className="flex justify-between text-sm">
                                  <span>{utilization.toFixed(1)}%</span>
                                </div>
                                <Progress 
                                  value={Math.min(utilization, 100)} 
                                  className="h-2"
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={status.variant}>
                                {status.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditBudget(project)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
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
                  Setup Project Budgets
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
                    {hasBudgetSet(editingProject) ? 'Edit' : 'Setup'} Project Budget
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
                    {hasBudgetSet(editingProject) ? 'Update' : 'Setup'} Budget
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