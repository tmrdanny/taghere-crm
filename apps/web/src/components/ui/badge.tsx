'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-800 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-brand-800 text-white',
        secondary: 'bg-neutral-100 text-neutral-700',
        success: 'bg-success-light text-green-700',
        warning: 'bg-warning-light text-amber-700',
        error: 'bg-error-light text-red-700',
        info: 'bg-info-light text-blue-700',
        outline: 'border border-neutral-200 text-neutral-700',
        vip: 'bg-amber-100 text-amber-700 border border-amber-200',
        new: 'bg-blue-100 text-blue-700 border border-blue-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
