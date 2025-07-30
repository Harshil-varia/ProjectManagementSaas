'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Square, Clock } from 'lucide-react'

interface Project {
  id: string
  name: string
  color: string
}

interface TimeTrackerProps {
  projects: Project[]
  onStart: (projectId: string, description: string) => void
  onStop: () => void
  activeEntry?: {
    id: string
    startTime: Date
    projectId: string
    description: string
  }
}

export default function TimeTracker({
  projects,
  onStart,
  onStop,
  activeEntry
}: TimeTrackerProps) {
  const [selectedProject, setSelectedProject] = useState('')
  const [description, setDescription] = useState('')
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (activeEntry) {
      interval = setInterval(() => {
        const now = new Date()
        const start = new Date(activeEntry.startTime)
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)
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

  const handleStart = () => {
    if (selectedProject) {
      onStart(selectedProject, description)
    }
  }

  const handleStop = () => {
    onStop()
    setDescription('')
    setSelectedProject('')
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeEntry ? (
          <div className="text-center space-y-4">
            <div className="text-4xl font-mono font-bold text-blue-600">
              {formatTime(elapsedTime)}
            </div>
            <div className="text-lg font-medium">
              {projects.find(p => p.id === activeEntry.projectId)?.name}
            </div>
            {activeEntry.description && (
              <div className="text-sm text-gray-600">
                {activeEntry.description}
              </div>
            )}
            <Button onClick={handleStop} size="lg" variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop Timer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="project">Project</Label>
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
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What are you working on?"
              />
            </div>
            <Button
              onClick={handleStart}
              size="lg"
              className="w-full"
              disabled={!selectedProject}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Timer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}