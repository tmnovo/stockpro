import { Sun, Moon, Translate, List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header({ title, onMenuClick }) {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useLanguage();

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-background sticky top-0 z-30" data-testid="main-header">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onMenuClick}
          data-testid="mobile-menu-btn"
          aria-label="Menu"
        >
          <List size={22} weight="duotone" />
        </Button>
        <h1 className="font-display text-lg sm:text-xl md:text-2xl font-bold tracking-tight truncate" data-testid="page-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-1 md:gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 px-2 md:px-3" data-testid="language-selector">
              <Translate size={18} weight="duotone" />
              <span className="font-mono text-xs uppercase">{lang}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setLang("pt")} data-testid="lang-pt">Português</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLang("en")} data-testid="lang-en">English</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          data-testid="theme-toggle"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon size={18} weight="duotone" /> : <Sun size={18} weight="duotone" />}
        </Button>
      </div>
    </header>
  );
}
