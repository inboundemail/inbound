"use client"

import { Card, CardContent } from "@/components/ui/card"

interface StatusDay {
  date: string
  status: 'up' | 'down' | 'degraded'
}

// Mock historical data - in a real app this would come from your API
const generateLast30Days = (): StatusDay[] => {
  const days: StatusDay[] = []
  const today = new Date()
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    
    // Mock status - mostly up with occasional degraded/down
    let status: StatusDay['status'] = 'up'
    const random = Math.random()
    if (random < 0.05) {
      status = 'down'
    } else if (random < 0.15) {
      status = 'degraded'
    }
    
    days.push({
      date: date.toISOString().split('T')[0],
      status
    })
  }
  
  return days
}

const historicalData: StatusDay[] = generateLast30Days()

const getStatusColor = (status: StatusDay['status']) => {
  switch (status) {
    case 'up':
      return 'bg-green-500'
    case 'down':
      return 'bg-red-500'
    case 'degraded':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-300'
  }
}

export function HistoricalStatusCard() {
  return (
    <Card className="w-full" suppressHydrationWarning> 
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium text-center">API Status</div>
        
        <div className="flex gap-1 justify-center">
          {historicalData.map((day, index) => (
            <div
              key={index}
              className={`h-6 w-1 rounded-sm ${getStatusColor(day.status)}`}
              title={`${day.date}: ${day.status}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
} 