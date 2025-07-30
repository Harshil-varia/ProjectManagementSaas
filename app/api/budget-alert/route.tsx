// components/budget-alerts.tsx
'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, TrendingUp, DollarSign, X } from 'lucide-react'
import { Prisma } from '@prisma/client'

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

  // ✅ FIXED: Safe currency formatting
  const formatCurrency = (amount: number | Prisma.Decimal): string => {
    try {
      let numericAmount: number
      
      if (typeof amount === 'number') {
        numericAmount = amount
      } else if (amount && typeof amount.toNumber === 'function') {
        // Handle Prisma Decimal
        numericAmount = amount.toNumber()
        
        // Validate the conversion
        if (!Number.isFinite(numericAmount)) {
          console.warn('Decimal value is not finite:', amount.toString())
          numericAmount = parseFloat(amount.toFixed(2))
        }
        
        if (Math.abs(numericAmount) > Number.MAX_SAFE_INTEGER) {
          console.warn('Number exceeds safe integer range:', numericAmount)
          numericAmount = parseFloat(amount.toFixed(2))
        }
      } else {
        numericAmount = 0
      }
      
      // Handle invalid amounts
      if (typeof numericAmount !== 'number' || isNaN(numericAmount) || !isFinite(numericAmount)) {
        numericAmount = 0
      }

      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numericAmount)
    } catch (error) {
      console.error('Currency formatting error:', error)
      return '$0'
    }
  }