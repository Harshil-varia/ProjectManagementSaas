'use client';
import { useState } from 'react';
import { format, addWeeks, startOfWeek, eachDayOfInterval, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function TimeEntryCalendar() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [timeEntries, setTimeEntries] = useState<Record<string, string>>({});
  
  // Generate days for current week
  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentWeek, { weekStartsOn: 1 }), // Monday
    end: addDays(startOfWeek(currentWeek, { weekStartsOn: 1}), 6)
  });

  const handleTimeChange = (date: Date, hours: string) => {
    setTimeEntries(prev => ({
      ...prev,
      [date.toISOString()]: hours
    }));
  };

  const handleSubmit = async () => {
    // Submit to API
    const response = await fetch('/api/time-entries', {
      method: 'POST',
      body: JSON.stringify({
        entries: Object.entries(timeEntries).map(([date, hours]) => ({
          date,
          hours: parseFloat(hours)
        }))
      })
    });
    
    if (response.ok) {
      // Clear form after successful submission
      setTimeEntries({});
    }
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}>
          &lt; Previous
        </Button>
        
        <h2 className="text-xl font-bold">
          {format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'MMM dd')} - 
          {format(addDays(startOfWeek(currentWeek, { weekStartsOn: 1 }), 6), 'MMM dd, yyyy')}
        </h2>
        
        <Button variant="outline" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          Next &gt;
        </Button>
      </div>

      <div className="grid grid-cols-8 gap-2">
        <div className="font-bold text-center">Day</div>
        <div className="font-bold text-center col-span-7">Hours</div>
        
        {weekDays.map(day => (
          <>
            <div key={`day-${day.toISOString()}`} className="text-center py-2">
              {format(day, 'EEE')}<br />
              <span className="text-sm">{format(day, 'MM/dd')}</span>
            </div>
            <div key={`input-${day.toISOString()}`} className="col-span-7">
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={timeEntries[day.toISOString()] || ''}
                onChange={(e) => handleTimeChange(day, e.target.value)}
                placeholder="0.00"
              />
            </div>
          </>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSubmit}>Submit Timesheet</Button>
      </div>
    </Card>
  );
}