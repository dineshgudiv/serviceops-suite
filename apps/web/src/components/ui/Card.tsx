import React from 'react';
export function Card({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={`so-card ${className}`}>{children}</section>;
}
