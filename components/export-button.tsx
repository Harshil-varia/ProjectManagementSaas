'use client';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface TimeEntry {
  id: string;
  start: Date;
  end: Date | null;
  duration: number;
  project: { name: string; color: string } | null;
  user: { email: string };
  description: string | null;
}

interface ExportButtonProps {
  entries: TimeEntry[];
  totalHours: number;
  period: string;
}

export default function ExportButton({ entries, totalHours, period }: ExportButtonProps) {
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Time Tracking Report', 20, 20);
    
    // Summary
    doc.setFontSize(12);
    doc.text(`Period: ${period}`, 20, 40);
    doc.text(`Total Hours: ${totalHours.toFixed(1)}`, 20, 50);
    
    // Table data
    const tableData = entries.map(entry => [
      new Date(entry.start).toLocaleDateString(),
      new Date(entry.start).toLocaleTimeString(),
      entry.end ? new Date(entry.end).toLocaleTimeString() : 'Active',
      entry.duration.toFixed(1) + 'h',
      entry.project?.name || 'No Project',
      entry.description || ''
    ]);

    // @ts-ignore
    doc.autoTable({
      head: [['Date', 'Start', 'End', 'Duration', 'Project', 'Description']],
      body: tableData,
      startY: 60,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] }
    });

    doc.save(`timesheet-${period}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Project', 'Description'];
    const csvData = entries.map(entry => [
      new Date(entry.start).toLocaleDateString(),
      new Date(entry.start).toLocaleTimeString(),
      entry.end ? new Date(entry.end).toLocaleTimeString() : 'Active',
      entry.duration.toFixed(1),
      entry.project?.name || 'No Project',
      entry.description || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <Button onClick={exportToPDF} variant="outline" size="sm">
        <Download className="h-4 w-4 mr-2" />
        Export PDF
      </Button>
      <Button onClick={exportToCSV} variant="outline" size="sm">
        <Download className="h-4 w-4 mr-2" />
        Export CSV
      </Button>
    </div>
  );
}