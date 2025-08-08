// components/dashboard-layout.tsx
'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {  
  Calendar, 
  BarChart3, 
  FolderOpen, 
  Users,
  Settings,
  DollarSign,
  Shield,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Eye,
  Edit
} from 'lucide-react'

interface ProjectPermission {
  id: string
  name: string
  color: string
  canView: boolean
  canEdit: boolean
  permissions: string[] // Array of PermissionType values
}

interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  adminOnly?: boolean
  employeeOnly?: boolean // New property for employee-only items
  children?: NavigationItem[]
}

// Custom hook to fetch user project permissions
const useProjectPermissions = () => {
  const { data: session } = useSession()
  const [projectPermissions, setProjectPermissions] = useState<ProjectPermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProjectPermissions = async () => {
      if (!session) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/users/project-permissions')
        if (response.ok) {
          const data = await response.json()
          setProjectPermissions(data.projects || [])
        }
      } catch (error) {
        console.error('Failed to fetch project permissions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProjectPermissions()
  }, [session])

  return { projectPermissions, loading }
}

// Base navigation structure
const getBaseNavigation = (): NavigationItem[] => [
  {
    name: 'Time Sheet',
    href: '/calendar',
    icon: Calendar,
    adminOnly: false, // Only employees need this
    employeeOnly: true, // New property to indicate employee-only items
  },
  {
    name: 'Projects',
    href: '/projects',
    icon: FolderOpen,
    adminOnly: true,
    employeeOnly: false,
  },
  {
    name: 'Profile',
    href: '/profile',
    icon: Users,
    // No restrictions - available to everyone
  },
  {
    name: 'User Timesheets',
    href: '/reports',
    icon: Users,
    adminOnly: true
  },
  {
    name: 'Administration',
    href: '/admin',
    icon: Settings,
    adminOnly: true,
    children: [
      {
        name: 'User Management',
        href: '/admin/users',
        icon: Users,
        adminOnly: true
      },
      {
        name: 'Rate Management',
        href: '/admin/rates',
        icon: DollarSign,
        adminOnly: true,
        badge: ''
      },
      {
        name: 'Permissions',
        href: '/admin/permissions',
        icon: Shield,
        adminOnly: true,
        badge: ''
      },
      {
        name: 'Project Management',
        href: '/admin/budgets',
        icon: FolderOpen,
        adminOnly: true,
        badge: ''
      }, {
        name: 'Monthly Summary',
        href: '/admin/monthly-summary',
        icon: DollarSign,
        adminOnly: true,
        badge: ''
      }
    ]
  }
]

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const { projectPermissions, loading: permissionsLoading } = useProjectPermissions()

  useEffect(() => {
    // Auto-expand current section
    const allNavigation = getNavigationWithPermissions()
    const currentItem = allNavigation.find(item => 
      pathname.startsWith(item.href) || 
      item.children?.some(child => pathname.startsWith(child.href))
    )
    if (currentItem && currentItem.children) {
      setExpandedItems(new Set([currentItem.name]))
    }
  }, [pathname, projectPermissions])

  

  const getNavigationWithPermissions = (): NavigationItem[] => {
    const baseNavigation = getBaseNavigation()
    
    // If user has project permissions but is not admin, add project reports navigation
    if (projectPermissions.length > 0 && session?.user?.role !== 'ADMIN') {
      const projectReportsChildren: NavigationItem[] = projectPermissions.map(project => {
        // Determine icon and badge based on permissions
        let icon = Eye
        let badge = 'View'
        
        if (project.permissions.includes('FULL_ACCESS')) {
          icon = Shield
          badge = 'Full Access'
        } else if (project.permissions.includes('EDIT_BUDGETS')) {
          icon = Edit
          badge = 'Edit Budget'
        } else if (project.permissions.includes('VIEW_REPORTS')) {
          icon = Eye
          badge = 'View'
        }

        return {
          name: project.name,
          href: `/reports/projects/${project.id}`,
          icon,
          badge
        }
      })

      // Add or update My Project Reports section
      const myProjectReportsItem: NavigationItem = {
        name: 'My Project Reports',
        href: '/my-reports',
        icon: BarChart3,
        children: projectReportsChildren
      }

      // Insert after Profile and before admin sections
      const profileIndex = baseNavigation.findIndex(item => item.href === '/profile')
      if (profileIndex !== -1) {
        baseNavigation.splice(profileIndex + 1, 0, myProjectReportsItem)
      } else {
        baseNavigation.push(myProjectReportsItem)
      }
    }

    return baseNavigation
  }

  const toggleExpanded = (itemName: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemName)) {
      newExpanded.delete(itemName)
    } else {
      newExpanded.add(itemName)
    }
    setExpandedItems(newExpanded)
  }

  const isItemActive = (item: NavigationItem): boolean => {
    if (item.href === pathname) return true
    if (item.children) {
      return item.children.some(child => pathname.startsWith(child.href))
    }
    return pathname.startsWith(item.href) && item.href !== '/calendar'
  }

  const canAccessItem = (item: NavigationItem): boolean => {
    const userRole = session?.user?.role
    
    // Profile is accessible to all authenticated users
    if (item.href === '/profile') {
      return true
    }

    // My Project Reports is accessible to employees with project permissions
    if (item.name === 'My Project Reports') {
      return projectPermissions.length > 0 && userRole !== 'ADMIN'
    }

    // Admin-only items (Projects, Reports, Administration)
    if (item.adminOnly && userRole !== 'ADMIN') {
      return false
    }

    // Employee-only items (Time Sheet)
    if (item.employeeOnly && userRole === 'ADMIN') {
      return false
    }

    // All other items are accessible by default
    return true
  }

  const filterNavigation = (items: NavigationItem[]): NavigationItem[] => {
    return items
      .filter(canAccessItem)
      .map(item => ({
        ...item,
        children: item.children ? filterNavigation(item.children) : undefined
      }))
      .filter(item => !item.children || item.children.length > 0)
  }

  const navigationWithPermissions = getNavigationWithPermissions()
  const filteredNavigation = filterNavigation(navigationWithPermissions)

  const NavItem = ({ item, level = 0 }: { item: NavigationItem; level?: number }) => {
    const isActive = isItemActive(item)
    const isExpanded = expandedItems.has(item.name)
    const hasChildren = item.children && item.children.length > 0

    // Find project color if this is a project report item
    const projectColor = projectPermissions.find(p => 
      item.href.includes(p.id)
    )?.color

    return (
      <div>
        <Link
          href={hasChildren ? '#' : item.href}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault()
              toggleExpanded(item.name)
            } else {
              setSidebarOpen(false)
            }
          }}
          className={cn(
            'group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors',
            level > 0 && 'ml-4 pl-6',
            isActive
              ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <div className="flex items-center">
            {projectColor ? (
              <div
                className="mr-3 w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: projectColor }}
              />
            ) : (
              <item.icon className={cn(
                'mr-3 h-5 w-5 flex-shrink-0',
                isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
              )} />
            )}
            <span>{item.name}</span>
            {item.badge && (
              <Badge 
                variant={
                  item.badge === 'Full Access' ? 'default' : 
                  item.badge === 'Edit Budget' ? 'secondary' : 
                  'outline'
                } 
                className="ml-2 text-xs"
              >
                {item.badge}
              </Badge>
            )}
          </div>
          {hasChildren && (
            <div className="ml-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
          )}
        </Link>
        
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.filter(canAccessItem).map((child) => (
              <NavItem key={child.name} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          {/* Logo/Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">TT</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-gray-900">TimeTracker</h1>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
            {permissionsLoading ? (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              filteredNavigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))
            )}
          </nav>

          {/* User info */}
          {session && (
            <div className="border-t border-gray-200 p-4 space-y-2">
              <Link href="/profile" className="block hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-medium text-sm">
                        {session.user.name?.charAt(0) || session.user.email?.charAt(0)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.user.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={session.user.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {session.user.role}
                    </Badge>
                    <span className="text-xs text-gray-400">View Profile</span>
                    {projectPermissions.length > 0 && session.user.role !== 'ADMIN' && (
                      <span className="text-xs text-blue-500">
                        {projectPermissions.length} Projects
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}