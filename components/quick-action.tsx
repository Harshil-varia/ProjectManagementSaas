'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Square, Plus, Clock, Calendar } from 'lucide-react'
import React from 'react'

interface Project {
  id: string
  name: string
  color: string
}

interface ActiveEntry {
  id: string
  startTime: Date
  projectId: string
  description: string
}

interface QuickActionsProps {
  projects: Project[]
  activeEntry?: ActiveEntry
  recentProjects: Project[]
  onStartTimer: (projectId: string) => void
  onStopTimer: () => void
  onQuickEntry: () => void
}

export default function QuickActions({
  projects,
  activeEntry,
  recentProjects,
  onStartTimer,
  onStopTimer,
  onQuickEntry
}: QuickActionsProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  // Calculate elapsed time for active entry
  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (activeEntry) {
      interval = setInterval(() => {
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - activeEntry.startTime.getTime()) / 1000)
        setElapsedTime(elapsed)
      }, 1000)
    } else {
      setElapsedTime(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [activeEntry])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const currentProject = activeEntry 
    ? projects.find(p => p.id === activeEntry.projectId)
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Active Timer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {activeEntry ? 'Timer Running' : 'Quick Start'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeEntry ? (
            <div className="text-center space-y-4">
              <div className="text-3xl font-mono font-bold text-blue-600">
                {formatTime(elapsedTime)}
              </div>
              {currentProject && (
                <div className="flex items-center justify-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentProject.color }}
                  />
                  <span className="font-medium">{currentProject.name}</span>
                </div>
              )}
              <Button onClick={onStopTimer} size="lg" variant="destructive" className="w-full">
                <Square className="h-4 w-4 mr-2" />
                Stop Timer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Start timing your recent projects
              </p>
              <div className="grid grid-cols-1 gap-2">
                {recentProjects.slice(0, 3).map((project) => (
                  <Button
                    key={project.id}
                    variant="outline"
                    onClick={() => onStartTimer(project.id)}
                    className="justify-start"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: project.color }}
                    />
                    {project.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3">
            <Button onClick={onQuickEntry} variant="outline" className="justify-start">
              <Calendar className="h-4 w-4 mr-2" />
              Add Manual Entry
            </Button>
            
            <Button variant="outline" className="justify-start">
              <Clock className="h-4 w-4 mr-2" />
              View Calendar
            </Button>
            
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-2">Today's Summary</p>
              <div className="flex flex-wrap gap-1">
                {recentProjects.slice(0, 4).map((project) => (
                  <Badge
                    key={project.id}
                    variant="secondary"
                    className="text-xs"
                    style={{ backgroundColor: `${project.color}20` }}
                  >
                    {project.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}