'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Edit, Calendar, Clock, FileText } from 'lucide-react'
import { format } from 'date-fns'

interface TimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  description: string | null
  project: {
    id: string
    name: string
    description?: string | null
    color: string
  }
}

interface TimeEntriesTableProps {
  entries: TimeEntry[]
  onDelete: (id: string) => void
  onEdit: (entry: TimeEntry) => void
}

export default function TimeEntriesTable({
  entries,
  onDelete,
  onEdit
}: TimeEntriesTableProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Running...'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy')
  }

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'HH:mm')
  }

  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
    }
    setExpandedEntries(newExpanded)
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  return (
    <Card className="stats-card">
      <CardHeader>
        <CardTitle>Time Entries</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[200px]">Project</th>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[150px]">Description</th>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[120px]">Date</th>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[100px]">Time</th>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[100px]">Duration</th>
                  <th className="text-left p-4 font-medium text-muted-foreground min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isExpanded = expandedEntries.has(entry.id)
                  return (
                    <tr key={entry.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.project.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <div 
                              className="font-medium text-card-foreground cursor-pointer hover:text-primary transition-colors"
                              onClick={() => toggleExpanded(entry.id)}
                              title={entry.project.name}
                            >
                              {truncateText(entry.project.name, 25)}
                            </div>
                            {isExpanded && entry.project.name.length > 25 && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {entry.project.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="min-w-0">
                          <span 
                            className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                            onClick={() => toggleExpanded(entry.id)}
                            title={entry.description || 'No description'}
                          >
                            {entry.description 
                              ? truncateText(entry.description, 30)
                              : 'No description'
                            }
                          </span>
                          {isExpanded && entry.description && entry.description.length > 30 && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {entry.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-card-foreground whitespace-nowrap">
                          {formatDate(entry.startTime)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-card-foreground whitespace-nowrap timer-display">
                          {formatTime(entry.startTime)}
                          {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge className={entry.endTime ? 'badge-success' : 'badge-warning'}>
                          {formatDuration(entry.duration)}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEdit(entry)}
                            className="h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDelete(entry.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden">
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="time-entry-card p-4">
                <div className="space-y-3">
                  {/* Project Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.project.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-card-foreground text-sm break-words">
                          {entry.project.name}
                        </h3>
                      </div>
                    </div>
                    <Badge className={entry.endTime ? 'badge-success' : 'badge-warning'}>
                      {formatDuration(entry.duration)}
                    </Badge>
                  </div>

                  {/* Description */}
                  {entry.description && (
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground break-words">
                        {entry.description}
                      </p>
                    </div>
                  )}

                  {/* Date and Time */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(entry.startTime)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span className="timer-display">
                        {formatTime(entry.startTime)}
                        {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(entry)}
                      className="flex-1 hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(entry.id)}
                      className="flex-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {entries.length === 0 && (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No time entries found</h3>
            <p className="text-muted-foreground">
              Your time entries will appear here once you start tracking time.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}