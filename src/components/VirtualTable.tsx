import React, { useRef, useState, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
} from "@phosphor-icons/react";

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  render: (item: T, index: number) => React.ReactNode;
  width?: string; // e.g., '100px', '20%', 'minmax(150px, 1fr)'
  sortable?: boolean;
  sortAccessor?: (item: T) => string | number;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  rowHeight?: number;
  className?: string;
  keyExtractor: (item: T) => string;
}

export function VirtualTable<T>({
  data,
  columns,
  rowHeight = 56, // Tailwind's h-14 is 56px
  className = "",
  keyExtractor,
}: VirtualTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const parentRef = useRef<HTMLDivElement>(null);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortAccessor) return data;

    return [...data].sort((a, b) => {
      const aVal = col.sortAccessor!(a);
      const bVal = col.sortAccessor!(b);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, columns, sortKey, sortDir]);

  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const handleSort = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;

    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Convert width definitions to CSS gridTemplateColumns
  const gridTemplateColumns = columns.map((c) => c.width || "1fr").join(" ");

  return (
    <div
      ref={parentRef}
      className={`relative w-full overflow-auto bg-white border border-divider rounded-lg shadow-sm ${className}`}
      style={{
        maxHeight: "600px", // Can be overridden by className, e.g. h-[600px]
      }}
    >
      <div className="min-w-[800px]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-page border-b border-divider shadow-sm">
          <div
            className="grid px-6 py-3 text-xs font-medium tracking-wider text-left text-ink-muted uppercase"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={`flex items-center space-x-1 ${
                  col.sortable ? "cursor-pointer hover:text-ink/80" : ""
                }`}
                onClick={() => handleSort(col.key)}
              >
                <span>{col.header}</span>
                {col.sortable && sortKey === col.key && (
                  <span className="text-ink-muted/80">
                    {sortDir === "asc" ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Virtualized Body */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = sortedData[virtualRow.index];
            return (
              <div
                key={keyExtractor(item)}
                className="absolute top-0 left-0 w-full hover:bg-page border-b border-divider/60 last:border-b-0 transition-colors"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="grid h-full px-6 items-center text-sm text-ink"
                  style={{ gridTemplateColumns }}
                >
                  {columns.map((col) => (
                    <div key={col.key} className="truncate pr-4">
                      {col.render(item, virtualRow.index)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {sortedData.length === 0 && (
          <div className="p-8 text-center text-ink-muted">No records found.</div>
        )}
      </div>
    </div>
  );
}
