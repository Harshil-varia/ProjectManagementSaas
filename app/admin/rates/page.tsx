'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, DollarSign, Shield, Edit, History, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface User {
  id: string
  name: string | null
  email: string
  role: string
  employeeRate: number
  rateHistory: Array<{
    id: string
    rate: number
    effectiveDate: string
    createdAt: string
    createdBy: string
  }>
}

export default function AdminRatesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newRate, setNewRate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [updating, setUpdating] = useState(false)

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session && session.user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [session, status, router])

  useEffect(() => {
    if (session && session.user.role === 'ADMIN') {
      fetchUsers()
    }
  }, [session])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/rates')
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        toast.error('Failed to fetch users')
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      toast.error('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const handleEditRate = (user: User) => {
    setEditingUser(user)
    setNewRate(user.employeeRate.toString())
    setEffectiveDate(new Date().toISOString().split('T')[0])
  }

  const handleUpdateRate = async () => {
    if (!editingUser || !newRate) return

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/rates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: editingUser.id,
          rate: parseFloat(newRate),
          effectiveDate
        }),
      })

      if (response.ok) {
        toast.success('Rate updated successfully')
        setEditingUser(null)
        setNewRate('')
        setEffectiveDate('')
        fetchUsers() // Refresh data
      } else {
        toast.error('Failed to update rate')
      }
    } catch (error) {
      console.error('Failed to update rate:', error)
      toast.error('Failed to update rate')
    } finally {
      setUpdating(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
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
          <p className="text-gray-600">You need admin privileges to manage employee rates.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Rate Management</h1>
            <p className="text-gray-600">Manage hourly rates for all employees</p>
          </div>
          <Badge variant="destructive" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Admin Only
          </Badge>
        </div>

       
        {/* Rates Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Employee Rates
            </CardTitle>
            <CardDescription>Current hourly rates for all employees</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Current Rate</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name || 'No Name'}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {formatCurrency(user.employeeRate)}/hr
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.rateHistory.length > 0 ? (
                          <div className="text-sm">
                            <div>{format(new Date(user.rateHistory[0].effectiveDate), 'MMM dd, yyyy')}</div>
                            <div className="text-gray-500">
                              {user.rateHistory.length} change{user.rateHistory.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500">Never updated</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRate(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {user.rateHistory.length > 0 && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <History className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Rate History - {user.name || user.email}</DialogTitle>
                                  <DialogDescription>
                                    Historical rate changes for this employee
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="max-h-96 overflow-y-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Rate</TableHead>
                                        <TableHead>Effective Date</TableHead>
                                        <TableHead>Changed On</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {user.rateHistory.map((history) => (
                                        <TableRow key={history.id}>
                                          <TableCell>{formatCurrency(history.rate)}/hr</TableCell>
                                          <TableCell>
                                            {format(new Date(history.effectiveDate), 'MMM dd, yyyy')}
                                          </TableCell>
                                          <TableCell>
                                            {format(new Date(history.createdAt), 'MMM dd, yyyy HH:mm')}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Rate Dialog */}
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Employee Rate</DialogTitle>
              <DialogDescription>
                Update the hourly rate for {editingUser?.name || editingUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rate">New Hourly Rate ($)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateRate} disabled={updating || !newRate}>
                {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Rate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}