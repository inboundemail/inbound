"use client"

import { HiLightningBolt, HiMail, HiUserGroup } from 'react-icons/hi'
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
      icon: HiLightningBolt,
      title: 'Webhook',
      description: 'Send HTTP requests to your application',
      color: 'purple'
    },
    {
      type: 'email' as const,
      icon: HiMail,
      title: 'Email Forward',
      description: 'Forward emails to a single recipient',
      color: 'blue'
    },
    {
      type: 'email_group' as const,
      icon: HiUserGroup,
      title: 'Email Group',
      description: 'Forward emails to multiple recipients',
      color: 'green'
    }
  ]

  const getColorClasses = (color: string, isSelected: boolean) => {
    const colors = {
      purple: {
        border: isSelected ? 'border-purple-500' : 'border-gray-200',
        bg: isSelected ? 'bg-purple-50' : 'bg-white',
        icon: isSelected ? 'text-purple-600' : 'text-gray-400',
        title: isSelected ? 'text-purple-900' : 'text-gray-900',
        desc: isSelected ? 'text-purple-700' : 'text-gray-600'
      },
      blue: {
        border: isSelected ? 'border-blue-500' : 'border-gray-200',
        bg: isSelected ? 'bg-blue-50' : 'bg-white',
        icon: isSelected ? 'text-blue-600' : 'text-gray-400',
        title: isSelected ? 'text-blue-900' : 'text-gray-900',
        desc: isSelected ? 'text-blue-700' : 'text-gray-600'
      },
      green: {
        border: isSelected ? 'border-green-500' : 'border-gray-200',
        bg: isSelected ? 'bg-green-50' : 'bg-white',
        icon: isSelected ? 'text-green-600' : 'text-gray-400',
        title: isSelected ? 'text-green-900' : 'text-gray-900',
        desc: isSelected ? 'text-green-700' : 'text-gray-600'
      }
    }
    return colors[color as keyof typeof colors]
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-900">Endpoint Type</h4>
        <p className="text-xs text-gray-600">Choose how you want to receive emails</p>
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
                      ? `bg-${typeOption.color}-100` 
                      : 'bg-gray-100'
                  }`}>
                    <Icon className={`h-5 w-5 ${colors.icon}`} />
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
                      <div className="w-2 h-2 rounded-full bg-white"></div>
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