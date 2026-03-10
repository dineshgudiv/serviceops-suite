import React from 'react';
export function Button({ className = '', variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'ghost'|'danger' }) {
  return <button {...props} className={`so-btn so-btn-${variant} ${className}`} />;
}
