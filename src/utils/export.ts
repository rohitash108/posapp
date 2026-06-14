import { Platform, Alert } from 'react-native';

/** Escape a value for CSV (handles commas, quotes, newlines). */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build CSV string from headers + rows. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map(row => row.map(csvCell).join(',')),
  ];
  return lines.join('\n');
}

/** Download or share a CSV file (web: download; native: alert with copy hint). */
export function downloadCsv(filename: string, csv: string): void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  Alert.alert('Export', `CSV ready (${filename}). Export download is available on web.`);
}
