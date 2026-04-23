import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Generic searchable dropdown.
 *
 * Props:
 *   items      Array of any shape
 *   value      Currently selected item id (string)
 *   onChange   (newId) => void
 *   getId      (item) => string
 *   getLabel   (item) => string               (main text shown when selected)
 *   getSearch  (item) => string               (haystack for client-side filter)
 *   renderRow  (item) => JSX                  (how each row looks in the list)
 *   placeholder,  searchPlaceholder, emptyText, testid, disabled, className
 */
export default function SearchableSelect({
  items = [],
  value = "",
  onChange,
  getId = (i) => i.id,
  getLabel = (i) => i.name || "",
  getSearch,
  renderRow,
  placeholder = "—",
  searchPlaceholder = "Pesquisar…",
  emptyText = "Sem resultados",
  testid,
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => getId(i) === value);
  const label = selected ? getLabel(selected) : placeholder;
  const searchFn = getSearch || ((i) => `${getLabel(i)}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testid}
          className={cn("w-full justify-between h-9 font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{label}</span>
          <CaretDown size={14} className="opacity-60 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
        <Command
          filter={(val, search) => {
            const q = (search || "").toLowerCase().trim();
            if (!q) return 1;
            // "val" is the CommandItem `value` we assign (the haystack)
            return val.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} data-testid={testid ? `${testid}-search` : undefined} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                const id = getId(item);
                const haystack = searchFn(item);
                return (
                  <CommandItem
                    key={id}
                    value={haystack}
                    onSelect={() => {
                      onChange?.(id);
                      setOpen(false);
                    }}
                    data-testid={testid ? `${testid}-opt-${id}` : undefined}
                  >
                    <Check size={14} className={cn("mr-2 shrink-0", value === id ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      {renderRow ? renderRow(item) : <span className="truncate">{getLabel(item)}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
