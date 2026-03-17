import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconRight, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 w-4 h-4">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-9 rounded-md border text-sm transition-colors',
            'bg-white dark:bg-surface-800',
            'border-surface-200 dark:border-surface-700',
            'text-surface-900 dark:text-surface-100',
            'placeholder-surface-400 dark:placeholder-surface-500',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
            icon && 'pl-9',
            iconRight && 'pr-9',
            !icon && !iconRight && 'px-3',
            error && 'border-red-400 focus:ring-red-400',
            className
          )}
          {...props}
        />
        {iconRight && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 w-4 h-4">
            {iconRight}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-surface-400">{hint}</p>}
    </div>
  )
);

Input.displayName = 'Input';
