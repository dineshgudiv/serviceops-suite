import React from 'react';
export function DataTable({ columns, rows }: { columns: string[]; rows: Array<Record<string, any>> }) {
  return (
    <div className="overflow-auto">
      <table className="so-table">
        <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
