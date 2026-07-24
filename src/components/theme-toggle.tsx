'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3 text-muted-foreground"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:inline" />
      <span className="dark:hidden">深色模式</span>
      <span className="hidden dark:inline">浅色模式</span>
    </Button>
  )
}
