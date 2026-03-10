import type { AuditEvent } from './types';
import type { AuditCategory, AuditSeverity, ServerAuditEvent } from './server-types';

export function auditCategory(action: string): AuditCategory {
  if (['upload_started', 'dataset_parsed', 'dataset_parse_failed', 'upload_cancelled', 'dataset_deleted'].includes(action)) return 'DATA EVENTS';
  if (['analysis_started', 'analysis_completed', 'analysis_blocked', 'job_cancelled'].includes(action)) return 'ANALYSIS EVENTS';
  if (['report_generated'].includes(action)) return 'REPORT EVENTS';
  if (['case_created', 'case_closed', 'settings_updated'].includes(action)) return 'USER ACTIONS';
  return 'USER ACTIONS';
}

export function auditSeverity(action: string): AuditSeverity {
  if (action.includes('failed')) return 'ERROR';
  if (action.includes('cancelled') || action === 'analysis_blocked') return 'WARNING';
  if (action.includes('security')) return 'SECURITY';
  return 'INFO';
}

export function toServerAuditEvent(event: AuditEvent): ServerAuditEvent {
  return {
    ...event,
    category: auditCategory(event.action),
    severity: auditSeverity(event.action),
  };
}
