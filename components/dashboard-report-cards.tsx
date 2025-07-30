// components/dashboard-report-cards.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart3, TrendingUp, Clock, DollarSign } from 'lucide-react'

interface ProjectSummary {
  id: string
  name: string
  color: string
  totalBudget: number
  totalSpent: number
  totalHours: number
  utilization: number
  canViewReports: boolean
}

export default function DashboardReportCards() {
  const { data: session } = useSession()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetchProjectSummaries()
    }
  }, [session])

  const fetchProjectSummaries = async () => {
    try {
      const response = await fetch('/api/dashboard/project-summaries')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Failed to fetch project summaries:', error)
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

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 100) return 'text-red-600'
    if (utilization >= 90) return 'text-orange-600'
    if (utilization >= 75) return 'text-yellow-600'
    return 'text-green-600'
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const accessibleProjects = projects.filter(p => p.canViewReports)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Project Reports
            </CardTitle>
            <CardDescription>
              {accessibleProjects.length > 0 
                ? `${accessibleProjects.length} project${accessibleProjects.length !== 1 ? 's' : ''} available`
                : 'No report access granted'
              }
            </CardDescription>
          </div>
          <Link href="/projects">
            <Button variant="outline" size="sm">
              View All Projects
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {accessibleProjects.length > 0 ? (
          <div className="space-y-3">
            {accessibleProjects.slice(0, 5).map((project) => (
              <div key={project.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{project.name}</div>
                    <div className="text-sm text-gray-500 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {project.totalHours.toFixed(1)}h
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(project.totalSpent)}
                      </span>
                      <span className={`flex items-center gap-1 ${getUtilizationColor(project.utilization)}`}>
                        <TrendingUp className="h-3 w-3" />
                        {project.utilization.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <Link href={`/reports/project/${project.id}`}>
                  <Button variant="outline" size="sm">
                    <BarChart3 className="h-4 w-4 mr-1" />
                    View Report
                  </Button>
                </Link>
              </div>
            ))}
            
            {accessibleProjects.length > 5 && (
              <div className="text-center pt-2">
                <Link href="/projects">
                  <Button variant="outline" size="sm">
                    View All {accessibleProjects.length} Projects
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-3">
              You don't have report access to any projects yet.
            </p>
            {session?.user?.role !== 'ADMIN' && (
              <p className="text-xs text-gray-400">
                Contact your administrator to request report access.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}