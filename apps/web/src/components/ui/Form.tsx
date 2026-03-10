import React from 'react';
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`so-input ${props.className ?? ''}`} />; }
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`so-input ${props.className ?? ''}`} />; }
