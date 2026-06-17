'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateRowHeight?: number;
  rowGapClass?: string;
  overscan?: number;
  className?: string;
}

/**
 * Virtualised grid that uses CSS grid for column layout
 * and virtualises rows via @tanstack/react-virtual.
 */
export default function VirtualGrid<T>({
  items,
  renderItem,
  estimateRowHeight = 320,
  rowGapClass = 'pb-14 sm:pb-20',
  overscan = 3,
  className = '',
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const probeRef = useRef<HTMLDivElement>(null);

  const detectColumns = useCallback(() => {
    if (!probeRef.current) return;
    const style = window.getComputedStyle(probeRef.current);
    const cols = style.gridTemplateColumns.split(' ').length;
    if (cols > 0 && cols !== columns) setColumns(cols);
  }, [columns]);

  useEffect(() => {
    detectColumns();
    const ro = new ResizeObserver(detectColumns);
    if (probeRef.current) ro.observe(probeRef.current);
    return () => ro.disconnect();
  }, [detectColumns]);

  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => document.body,
    estimateSize: () => estimateRowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <>
      <div
        ref={probeRef}
        aria-hidden
        className={`grid invisible h-0 overflow-hidden ${className}`}
      >
        <div />
      </div>

      <div
        ref={parentRef}
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIdx = virtualRow.index * columns;
          const rowItems = items.slice(startIdx, startIdx + columns);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={`${rowGapClass}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={`grid ${className}`}>
                {rowItems.map((item, i) => (
                  <React.Fragment key={startIdx + i}>
                    {renderItem(item, startIdx + i)}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
