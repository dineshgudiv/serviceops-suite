import fs from 'fs';
import path from 'path';
import readline from 'readline';
import XLSX from 'xlsx';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { datasetArtifacts, readWorkspace } from '../../../../../../lib/fraud/server-storage';

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { datasetId: string } }) {
  const scope = await getSessionOrgScope();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1));
  const pageSize = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? 20)));
  const workspace = readWorkspace(scope.orgKey);
  const dataset = workspace.datasets.find((item) => item.id === params.datasetId);
  if (!dataset) {
    return NextResponse.json({ request_id: 'web', code: 'DATASET_NOT_FOUND', message: 'Dataset not found.' }, { status: 404 });
  }
  const sourcePath = `${datasetArtifacts(scope.orgKey, dataset.id).sourcePath}${path.extname(dataset.name).toLowerCase()}`;
  if (dataset.fileKind !== 'csv') {
    const workbook = XLSX.readFile(sourcePath, { cellDates: true });
    const sheetName = dataset.selectedSheet ?? workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    const headers = rows.length ? Object.keys(rows[0]) : dataset.schema.map((field) => field.name);
    const offset = (page - 1) * pageSize;
    return NextResponse.json({ headers, page, pageSize, total: rows.length, rows: rows.slice(offset, offset + pageSize) });
  }

  const stream = fs.createReadStream(sourcePath, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  let index = 0;
  const offset = (page - 1) * pageSize;
  const rows: Record<string, string>[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headers.length) {
      headers = parseCsvLine(line).map((cell) => String(cell).trim());
      continue;
    }
    if (index >= offset && rows.length < pageSize) {
      const cells = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, cellIndex) => {
        row[header] = (cells[cellIndex] || '').trim();
      });
      rows.push(row);
    }
    index += 1;
    if (rows.length >= pageSize) break;
  }
  return NextResponse.json({ headers, page, pageSize, total: dataset.rowCount, rows });
}
