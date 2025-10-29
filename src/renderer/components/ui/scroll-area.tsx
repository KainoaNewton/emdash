import * as React from 'react';

import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        className={cn('relative overflow-auto', className)}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
