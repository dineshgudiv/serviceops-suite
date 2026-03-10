import React from 'react';
export function Badge({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <span className={`so-badge ${className}`}>{children}</span>;
}
