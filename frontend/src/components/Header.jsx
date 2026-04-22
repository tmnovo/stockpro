import { Sun, Moon, Translate } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header({ title }) {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useLanguage();

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background sticky top-0 z-30" data-testid="main-header">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight" data-testid="page-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2" data-testid="language-selector">
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
