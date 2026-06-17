/* eslint-disable react-hooks/exhaustive-deps */

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface CustomCategory {
  name: string;
  type: 'movie' | 'tv';
  query: string;
}

interface DoubanCustomSelectorProps {
  customCategories: CustomCategory[];
  primarySelection?: string;
  secondarySelection?: string;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  yearSelection?: string;
  onYearChange?: (value: string) => void;
}

const DoubanCustomSelector: React.FC<DoubanCustomSelectorProps> = ({
  customCategories,
  primarySelection,
  secondarySelection,
  onPrimaryChange,
  onSecondaryChange,
  yearSelection,
  onYearChange,
}) => {
  const primaryContainerRef = useRef<HTMLDivElement>(null);
  const primaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [primaryIndicatorStyle, setPrimaryIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const secondaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [secondaryIndicatorStyle, setSecondaryIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const secondaryScrollContainerRef = useRef<HTMLDivElement>(null);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: { label: string; value: string }[] = [
      { label: '全部年份', value: '' },
    ];
    for (let y = currentYear; y >= 2000; y--) {
      years.push({ label: `${y}年`, value: String(y) });
    }
    return years;
  }, [currentYear]);

  // Generate primary options based on customCategories
  const primaryOptions = React.useMemo(() => {
    const types = Array.from(new Set(customCategories.map((cat) => cat.type)));
    const sortedTypes = types.sort((a, b) => {
      if (a === 'movie' && b !== 'movie') return -1;
      if (a !== 'movie' && b === 'movie') return 1;
      return 0;
    });
    return sortedTypes.map((type) => ({
      label: type === 'movie' ? '电影' : '剧集',
      value: type,
    }));
  }, [customCategories]);

  // Generate secondary options based on selected primary
  const secondaryOptions = React.useMemo(() => {
    if (!primarySelection) return [];
    return customCategories
      .filter((cat) => cat.type === primarySelection)
      .map((cat) => ({
        label: cat.name || cat.query,
        value: cat.query,
      }));
  }, [customCategories, primarySelection]);

  const handleSecondaryWheel = React.useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = secondaryScrollContainerRef.current;
    if (container) {
      const scrollAmount = e.deltaY * 2;
      container.scrollLeft += scrollAmount;
    }
  }, []);

  useEffect(() => {
    const scrollContainer = secondaryScrollContainerRef.current;
    const capsuleContainer = secondaryContainerRef.current;

    if (scrollContainer && capsuleContainer) {
      scrollContainer.addEventListener('wheel', handleSecondaryWheel, {
        passive: false,
      });
      capsuleContainer.addEventListener('wheel', handleSecondaryWheel, {
        passive: false,
      });

      return () => {
        scrollContainer.removeEventListener('wheel', handleSecondaryWheel);
        capsuleContainer.removeEventListener('wheel', handleSecondaryWheel);
      };
    }
  }, [handleSecondaryWheel]);

  useEffect(() => {
    const scrollContainer = secondaryScrollContainerRef.current;
    const capsuleContainer = secondaryContainerRef.current;

    if (scrollContainer && capsuleContainer && secondaryOptions.length > 0) {
      scrollContainer.addEventListener('wheel', handleSecondaryWheel, {
        passive: false,
      });
      capsuleContainer.addEventListener('wheel', handleSecondaryWheel, {
        passive: false,
      });

      return () => {
        scrollContainer.removeEventListener('wheel', handleSecondaryWheel);
        capsuleContainer.removeEventListener('wheel', handleSecondaryWheel);
      };
    }
  }, [handleSecondaryWheel, secondaryOptions]);

  const updateIndicatorPosition = (
    activeIndex: number,
    containerRef: React.RefObject<HTMLDivElement>,
    buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
    setIndicatorStyle: React.Dispatch<
      React.SetStateAction<{ left: number; width: number }>
    >
  ) => {
    if (
      activeIndex >= 0 &&
      buttonRefs.current[activeIndex] &&
      containerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = buttonRefs.current[activeIndex];
        const container = containerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          if (buttonRect.width > 0) {
            setIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (primaryOptions.length > 0) {
      const activeIndex = primaryOptions.findIndex(
        (opt) => opt.value === (primarySelection || primaryOptions[0].value)
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle
      );
    }

    if (secondaryOptions.length > 0) {
      const activeIndex = secondaryOptions.findIndex(
        (opt) => opt.value === (secondarySelection || secondaryOptions[0].value)
      );
      updateIndicatorPosition(
        activeIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle
      );
    }
  }, [primaryOptions, secondaryOptions]);

  useEffect(() => {
    if (primaryOptions.length > 0) {
      const activeIndex = primaryOptions.findIndex(
        (opt) => opt.value === primarySelection
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle
      );
      return cleanup;
    }
  }, [primarySelection, primaryOptions]);

  useEffect(() => {
    if (secondaryOptions.length > 0) {
      const activeIndex = secondaryOptions.findIndex(
        (opt) => opt.value === secondarySelection
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle
      );
      return cleanup;
    }
  }, [secondarySelection, secondaryOptions]);

  const renderCapsuleSelector = (
    options: { label: string; value: string }[],
    activeValue: string | undefined,
    onChange: (value: string) => void,
    isPrimary = false
  ) => {
    const containerRef = isPrimary
      ? primaryContainerRef
      : secondaryContainerRef;
    const buttonRefs = isPrimary ? primaryButtonRefs : secondaryButtonRefs;
    const indicatorStyle = isPrimary
      ? primaryIndicatorStyle
      : secondaryIndicatorStyle;

    return (
      <div
        ref={containerRef}
        className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
      >
        {indicatorStyle.width > 0 && (
          <div
            className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}

        {options.map((option, index) => {
          const isActive = activeValue === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onChange(option.value)}
              className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'text-gray-900 dark:text-gray-100 cursor-default'
                  : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  if (!customCategories || customCategories.length === 0) {
    return null;
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Year filter */}
      {onYearChange && (
        <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
          <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
            年份
          </span>
          <select
            value={yearSelection || ''}
            onChange={(e) => onYearChange(e.target.value)}
            className='px-3 py-1.5 text-xs sm:text-sm rounded-full bg-gray-200/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 border-0 outline-none focus:ring-2 focus:ring-green-500/50 cursor-pointer appearance-none pr-8 bg-no-repeat bg-[right_10px_center]'
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23666%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")',
            }}
          >
            {yearOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Two-level selectors */}
      <div className='space-y-3 sm:space-y-4'>
        {/* Primary selector */}
        <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
          <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
            类型
          </span>
          <div className='overflow-x-auto'>
            {renderCapsuleSelector(
              primaryOptions,
              primarySelection || primaryOptions[0]?.value,
              onPrimaryChange,
              true
            )}
          </div>
        </div>

        {/* Secondary selector */}
        {secondaryOptions.length > 0 && (
          <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
              片单
            </span>
            <div ref={secondaryScrollContainerRef} className='overflow-x-auto'>
              {renderCapsuleSelector(
                secondaryOptions,
                secondarySelection || secondaryOptions[0]?.value,
                onSecondaryChange,
                false
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoubanCustomSelector;
