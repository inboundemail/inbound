"use client"

import { useEffect, useState } from "react"

export function useTypingEffect(
  texts: string[],
  speed = 100,
  deleteSpeed = 50,
  delayBetweenTexts = 2000,
  onComplete?: () => void,
) {
  const [displayText, setDisplayText] = useState("")
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (isComplete || texts.length === 0) return

    const targetText = texts[0] // Just use the first text
    
    if (displayText.length < targetText.length) {
      const timeout = setTimeout(() => {
        setDisplayText(targetText.slice(0, displayText.length + 1))
      }, speed)
      
      return () => clearTimeout(timeout)
    } else {
      // Typing is complete
      setIsComplete(true)
      onComplete?.()
    }
  }, [displayText, texts, speed, isComplete, onComplete])

  return { displayText, isComplete }
}
