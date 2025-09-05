import { useEffect } from 'react'
import { useNavigation } from '@/contexts/navigation-context'

/**
 * Custom hook to set the page title dynamically
 * @param title - The title to set for the page
 * @param deps - Optional dependency array to re-run the effect
 */
export function usePageTitle(title?: string, deps: React.DependencyList = []) {
  const { setCustomTitle, resetTitle } = useNavigation()

  useEffect(() => {
    if (title) {
      setCustomTitle(title)
    } else {
      resetTitle()
    }

    // Cleanup function to reset title when component unmounts
    return () => {
      resetTitle()
    }
  }, [title, setCustomTitle, resetTitle, ...deps])

  return { setCustomTitle, resetTitle }
} 