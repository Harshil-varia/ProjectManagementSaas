'use client';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProjectBreakdown {
  name: string;
  color: string;
  hours: number;
}

interface DailyBreakdown {
  date: string;
  hours: number;
}

interface ReportChartsProps {
  projectBreakdown: ProjectBreakdown[];
  dailyBreakdown: DailyBreakdown[];
  totalHours: number;
}

export default function ReportCharts({ projectBreakdown, dailyBreakdown, totalHours }: ReportChartsProps) {
  const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      {/* Project Breakdown Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Time by Project</CardTitle>
          <CardDescription>Total: {formatHours(totalHours)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={projectBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, hours }) => `${name}: ${formatHours(hours)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="hours"
              >
                {projectBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatHours(value as number)} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Daily Hours Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Hours</CardTitle>
          <CardDescription>Hours logged per day</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value) => formatHours(value as number)}
              />
              <Bar dataKey="hours" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}