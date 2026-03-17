import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function Divider({
  label,
  orientation = 'horizontal',
  className,
  ...props
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        className={cn('w-px bg-surface-200 dark:bg-surface-700', className)}
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)} {...props}>
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
        <span className="text-xs text-surface-500 dark:text-surface-400 font-medium">
          {label}
        </span>
        <div className="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
      </div>
    );
  }

  return (
    <div
      className={cn('h-px bg-surface-200 dark:bg-surface-700', className)}
      {...props}
    />
  );
}
