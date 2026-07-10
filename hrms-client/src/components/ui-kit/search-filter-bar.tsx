import { ReactNode, useEffect, useState } from "react";
import { Search, SlidersHorizontal, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";

interface Props {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  filtersSlot?: ReactNode;
  rightSlot?: ReactNode;
  showExport?: boolean;
  onExport?: () => void;
}

export function SearchFilterBar({
  value,
  onValueChange,
  placeholder = "Search…",
  filtersSlot,
  rightSlot,
  showExport = true,
  onExport,
}: Props) {
  const [draft, setDraft] = useState(value);
  const debouncedDraft = useDebouncedValue(draft);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (debouncedDraft !== value) onValueChange(debouncedDraft);
  }, [debouncedDraft, onValueChange, value]);

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full min-w-0 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-9 rounded-full pl-9"
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {filtersSlot ?? (
          <Button variant="outline" size="sm" className="rounded-full">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filters
          </Button>
        )}
        {showExport && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onExport}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        )}
        {rightSlot}
      </div>
    </div>
  );
}
