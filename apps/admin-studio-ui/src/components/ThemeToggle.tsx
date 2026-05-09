import { Button } from './ui/button.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.js';
import { useTheme, type Theme } from './theme.js';

const THEMES: Theme[] = ['system', 'light', 'dark'];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
                Theme: {theme}
              </Button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {THEMES.map((value) => (
              <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                {value === theme ? '✓ ' : ''}
                {value}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent>Choose light, dark, or system theme</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
