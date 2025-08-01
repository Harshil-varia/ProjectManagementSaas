'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Shield, Users, Plus, Trash2, Eye, Edit, Lock } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: string
  name: string | null
  email: string
  role: string
}

interface Project {
  id: string
  name: string
  color: string
}

interface Permission {
  id: string
  permission: string
  user: User
  project: Project
}

export default function AdminPermissionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [updating, setUpdating] = useState(false)

  const permissionOptions = [
    { value: 'VIEW_REPORTS', label: 'View Reports', icon: Eye, description: 'Can view project reports' },
    { value: 'EDIT_BUDGETS', label: 'Edit Budgets', icon: Edit, description: 'Can modify project budgets' },
    { value: 'FULL_ACCESS', label: 'Full Access', icon: Lock, description: 'Complete project access' }
  ]

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
      fetchData()
    }
  }, [session])

  const fetchData = async () => {
    try {
      const response = await fetch('/api/admin/permissions')
      if (response.ok) {
        const data = await response.json()
        setPermissions(data.permissions)
        setUsers(data.users)
        setProjects(data.projects)
      } else {
        toast.error('Failed to fetch permissions data')
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
      toast.error('Failed to fetch permissions data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPermission = async () => {
    if (!selectedUser || !selectedProject || selectedPermissions.length === 0) {
      toast.error('Please select user, project, and at least one permission')
      return
    }

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser,
          projectId: selectedProject,
          permissions: selectedPermissions
        }),
      })

      if (response.ok) {
        toast.success('Permissions updated successfully')
        setDialogOpen(false)
        setSelectedUser('')
        setSelectedProject('')
        setSelectedPermissions([])
        fetchData() // Refresh data
      } else {
        toast.error('Failed to update permissions')
      }
    } catch (error) {
      console.error('Failed to update permissions:', error)
      toast.error('Failed to update permissions')
    } finally {
      setUpdating(false)
    }
  }

  const handleDeletePermission = async (permissionId: string) => {
    if (!confirm('Are you sure you want to remove this permission?')) return

    try {
      const response = await fetch(`/api/admin/permissions?id=${permissionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast.success('Permission removed successfully')
        fetchData() // Refresh data
      } else {
        toast.error('Failed to remove permission')
      }
    } catch (error) {
      console.error('Failed to delete permission:', error)
      toast.error('Failed to remove permission')
    }
  }

  const getPermissionIcon = (permission: string) => {
    const option = permissionOptions.find(opt => opt.value === permission)
    return option ? option.icon : Shield
  }

  const getPermissionLabel = (permission: string) => {
    const option = permissionOptions.find(opt => opt.value === permission)
    return option ? option.label : permission
  }

  const getPermissionBadgeVariant = (permission: string) => {
    switch (permission) {
      case 'VIEW_REPORTS': return 'secondary'
      case 'EDIT_BUDGETS': return 'default'
      case 'FULL_ACCESS': return 'destructive'
      default: return 'outline'
    }
  }

  // Group permissions by user and project
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const key = `${permission.user.id}-${permission.project.id}`
    if (!acc[key]) {
      acc[key] = {
        user: permission.user,
        project: permission.project,
        permissions: []
      }
    }
    acc[key].permissions.push(permission)
    return acc
  }, {} as Record<string, { user: User; project: Project; permissions: Permission[] }>)

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
          <p className="text-gray-600">You need admin privileges to manage permissions.</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Permission Management</h1>
            <p className="text-gray-600">Manage project-specific permissions for users</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="destructive" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Admin Only
            </Badge>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Permission
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Project Permission</DialogTitle>
                  <DialogDescription>
                    Grant specific permissions to a user for a project
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">User</label>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(user => user.role !== 'ADMIN').map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{user.name || user.email}</span>
                              <Badge variant="secondary" className="ml-2">
                                {user.role}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project</label>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Permissions</label>
                    <div className="space-y-3">
                      {permissionOptions.map((option) => {
                        const IconComponent = option.icon
                        return (
                          <div key={option.value} className="flex items-start space-x-3">
                            <Checkbox
                              id={option.value}
                              checked={selectedPermissions.includes(option.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedPermissions([...selectedPermissions, option.value])
                                } else {
                                  setSelectedPermissions(selectedPermissions.filter(p => p !== option.value))
                                }
                              }}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor={option.value}
                                className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                <IconComponent className="h-4 w-4" />
                                {option.label}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {option.description}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddPermission} disabled={updating}>
                    {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Permission
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Permissions Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Permissions</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{permissions.length}</div>
              <p className="text-xs text-muted-foreground">
                Across {Object.keys(groupedPermissions).length} user-project combinations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users with Permissions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(permissions.map(p => p.user.id)).size}
              </div>
              <p className="text-xs text-muted-foreground">
                Out of {users.length} total users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects with Permissions</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(permissions.map(p => p.project.id)).size}
              </div>
              <p className="text-xs text-muted-foreground">
                Out of {projects.length} total projects
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Permissions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Current Permissions
            </CardTitle>
            <CardDescription>All project-specific permissions currently assigned</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : Object.keys(groupedPermissions).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(groupedPermissions).map((group) => (
                    <TableRow key={`${group.user.id}-${group.project.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{group.user.name || 'No Name'}</div>
                          <div className="text-sm text-gray-500">{group.user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: group.project.color }}
                          />
                          <span className="font-medium">{group.project.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {group.permissions.map((permission) => {
                            const IconComponent = getPermissionIcon(permission.permission)
                            return (
                              <Badge
                                key={permission.id}
                                variant={getPermissionBadgeVariant(permission.permission)}
                                className="flex items-center gap-1"
                              >
                                <IconComponent className="h-3 w-3" />
                                {getPermissionLabel(permission.permission)}
                              </Badge>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {group.permissions.map((permission) => (
                            <Button
                              key={permission.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeletePermission(permission.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Permissions Set</h3>
                <p className="text-gray-500 mb-4">
                  No project-specific permissions have been assigned yet.
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Permission
                </Button>
              </div>
            )}
          </CardContent>
        </Card>      
      </div>
    </DashboardLayout>
  )
}