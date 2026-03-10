import fs from 'fs';
import { NextResponse } from 'next/server';
import { getSessionOrgScope } from '../../../../../../lib/org';
import { readWorkspace, resolveReportPath } from '../../../../../../lib/fraud/server-storage';

export async function GET(_: Request, { params }: { params: { reportId: string } }) {
  const scope = await getSessionOrgScope();
  const workspace = readWorkspace(scope.orgKey);
  const report = workspace.reports.find((item) => item.id === params.reportId);
  if (!report) {
    return NextResponse.json({ code: 'REPORT_NOT_FOUND', message: 'Report artifact not found.' }, { status: 404 });
  }
  const reportPath = resolveReportPath(scope.orgKey, report.id, report.filename);
  if (!fs.existsSync(reportPath)) {
    return NextResponse.json({ code: 'REPORT_FILE_MISSING', message: 'Report file is not available on disk.' }, { status: 404 });
  }
  const buffer = fs.readFileSync(reportPath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${report.filename}"`,
      'content-length': String(buffer.byteLength),
    },
  });
}
