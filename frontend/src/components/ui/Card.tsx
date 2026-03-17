import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  hover,
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700',
        'shadow-card dark:shadow-card-dark',
        hover && 'transition-shadow hover:shadow-lg',
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
