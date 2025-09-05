"use client"

import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope2 from '@/components/icons/envelope-2'
import UserGroup from '@/components/icons/user-group'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface EndpointTypeSelectorProps {
  selectedType: 'webhook' | 'email' | 'email_group' | null
  onTypeSelect: (type: 'webhook' | 'email' | 'email_group') => void
  disabled?: boolean
}

export function EndpointTypeSelector({ selectedType, onTypeSelect, disabled = false }: EndpointTypeSelectorProps) {
  const types = [
    {
      type: 'webhook' as const,
      icon: BoltLightning,
      title: 'Webhook',
      description: 'Send HTTP requests to your application',
      color: 'purple'
    },
    {
      type: 'email' as const,
      icon: Envelope2,
      title: 'Email Forward',
      description: 'Forward emails to a single recipient',
      color: 'blue'
    },
    {
      type: 'email_group' as const,
      icon: UserGroup,
      title: 'Email Group',
      description: 'Forward emails to multiple recipients',
      color: 'green'
    }
  ]

  const getColorClasses = (color: string, isSelected: boolean) => {
    const colors = {
      purple: {
        border: isSelected ? 'border-purple-500' : 'border-border',
        bg: isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-card',
        icon: isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground',
        title: isSelected ? 'text-purple-900 dark:text-purple-100' : 'text-foreground',
        desc: isSelected ? 'text-purple-700 dark:text-purple-300' : 'text-muted-foreground'
      },
      blue: {
        border: isSelected ? 'border-blue-500' : 'border-border',
        bg: isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-card',
        icon: isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground',
        title: isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-foreground',
        desc: isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-muted-foreground'
      },
      green: {
        border: isSelected ? 'border-green-500' : 'border-border',
        bg: isSelected ? 'bg-green-50 dark:bg-green-900/20' : 'bg-card',
        icon: isSelected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
        title: isSelected ? 'text-green-900 dark:text-green-100' : 'text-foreground',
        desc: isSelected ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'
      }
    }
    return colors[color as keyof typeof colors]
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Endpoint Type</h4>
        <p className="text-xs text-muted-foreground">Choose how you want to receive emails</p>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {types.map((typeOption) => {
          const isSelected = selectedType === typeOption.type
          const colors = getColorClasses(typeOption.color, isSelected)
          const Icon = typeOption.icon
          
          return (
            <Card
              key={typeOption.type}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${colors.border} ${colors.bg} ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={() => !disabled && onTypeSelect(typeOption.type)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                    isSelected 
                      ? `bg-${typeOption.color}-100 dark:bg-${typeOption.color}-900/30` 
                      : 'bg-muted'
                  }`}>
                    <Icon width="20" height="20" className={colors.icon} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className={`text-sm font-semibold ${colors.title}`}>
                      {typeOption.title}
                    </h5>
                    <p className={`text-xs mt-1 ${colors.desc}`}>
                      {typeOption.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className={`w-4 h-4 rounded-full bg-${typeOption.color}-500 flex items-center justify-center`}>
                      <div className="w-2 h-2 rounded-full bg-white dark:bg-gray-900"></div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
} 