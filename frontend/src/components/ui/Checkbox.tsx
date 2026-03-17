import { forwardRef, InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate, className, ...props }, ref) => {
    return (
      <label className="inline-flex items-center gap-2 cursor-pointer group">
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-4 h-4 rounded border-2 transition-all',
              'border-surface-300 dark:border-surface-600',
              'peer-checked:bg-brand-500 peer-checked:border-brand-500',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2',
              'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed',
              'group-hover:border-surface-400 dark:group-hover:border-surface-500',
              className
            )}
          >
            {props.checked && !indeterminate && (
              <Check className="w-3 h-3 text-white absolute inset-0.5" strokeWidth={3} />
            )}
            {indeterminate && (
              <Minus className="w-3 h-3 text-white absolute inset-0.5" strokeWidth={3} />
            )}
          </div>
        </div>
        {label && (
          <span className="text-sm text-surface-700 dark:text-surface-300 select-none">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
