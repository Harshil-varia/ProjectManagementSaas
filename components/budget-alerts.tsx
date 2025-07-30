// components/budget-alerts.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, TrendingUp, DollarSign, X } from 'lucide-react'
import { format } from 'date-fns'

interface BudgetAlert {
  id: string
  projectId: string
  projectName: string
  projectColor: string
  type: 'warning' | 'critical' | 'over-budget'
  quarter: string
  budgetAmount: number
  spentAmount: number
  utilization: number
  projectedOverage?: number
}

interface BudgetAlertsProps {
  className?: string
  maxAlerts?: number
}

export default function BudgetAlerts({ className, maxAlerts = 5 }: BudgetAlertsProps) {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<BudgetAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (session) {
      fetchBudgetAlerts()
    }
  }, [session])

  const fetchBudgetAlerts = async () => {
    try {
      const response = await fetch('/api/budget-alerts')
      if (response.ok) {
        const data = await response.json()
        setAlerts(data.alerts || [])
      }
    } catch (error) {
      console.error('Failed to fetch budget alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]))
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getAlertConfig = (type: BudgetAlert['type']) => {
    switch (type) {
      case 'warning':
        return {
          icon: TrendingUp,
          color: 'text-yellow-600',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          badgeVariant: 'secondary' as const,
          title: 'Budget Warning'
        }
      case 'critical':
        return {
          icon: AlertTriangle,
          color: 'text-orange-600',
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          badgeVariant: 'destructive' as const,
          title: 'Critical Budget Alert'
        }
      case 'over-budget':
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          badgeVariant: 'destructive' as const,
          title: 'Over Budget'
        }
    }
  }

  const getQuarterLabel = (quarter: string) => {
    const quarterMap = {
      'q1': 'Q1 (Apr-Jun)',
      'q2': 'Q2 (Jul-Sep)',
      'q3': 'Q3 (Oct-Dec)',
      'q4': 'Q4 (Jan-Mar)'
    }
    return quarterMap[quarter as keyof typeof quarterMap] || quarter
  }

  const visibleAlerts = alerts
    .filter(alert => !dismissedAlerts.has(alert.id))
    .slice(0, maxAlerts)

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Budget Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (visibleAlerts.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Budget Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <DollarSign className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">All project budgets are on track!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Budget Alerts
        </CardTitle>
        <CardDescription>
          {visibleAlerts.length} project{visibleAlerts.length !== 1 ? 's' : ''} require attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {visibleAlerts.map((alert) => {
            const config = getAlertConfig(alert.type)
            const IconComponent = config.icon

            return (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <IconComponent className={`h-4 w-4 ${config.color}`} />
                    <Badge variant={config.badgeVariant} className="text-xs">
                      {config.title}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: alert.projectColor }}
                      />
                      <span className="font-medium text-sm">{alert.projectName}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {getQuarterLabel(alert.quarter)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{formatCurrency(alert.spentAmount)} spent</span>
                      <span>{alert.utilization.toFixed(1)}% of budget</span>
                    </div>
                    <Progress 
                      value={Math.min(alert.utilization, 100)} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Budget: {formatCurrency(alert.budgetAmount)}</span>
                      {alert.type === 'over-budget' && alert.projectedOverage && (
                        <span className="text-red-600">
                          +{formatCurrency(alert.projectedOverage)} over
                        </span>
                      )}
                    </div>
                  </div>

                  {alert.type === 'over-budget' ? (
                    <p className="text-xs text-red-700 mt-2">
                      This project has exceeded its quarterly budget. Immediate attention required.
                    </p>
                  ) : alert.type === 'critical' ? (
                    <p className="text-xs text-orange-700 mt-2">
                      Project is at 90%+ of budget. Monitor spending closely.
                    </p>
                  ) : (
                    <p className="text-xs text-yellow-700 mt-2">
                      Project has reached 75% of budget. Consider reviewing spending.
                    </p>
                  )}
                </div>
              </div>
            )
          })}

          {alerts.length > maxAlerts && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm">
                View All Budget Alerts ({alerts.length})
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}