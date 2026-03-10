from flask import Flask, request, jsonify
import hashlib
import datetime
import re
import sqlite3
import os
import json

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'serviceops.db')


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso():
    return datetime.datetime.utcnow().isoformat() + 'Z'


def require_scope():
    org_id = request.headers.get('X-Org-Id', '').strip()
    role = request.headers.get('X-Role', '').strip().lower()
    if not org_id or not role:
        return None, (jsonify({'code': 'FORBIDDEN', 'message': 'org/role scope required'}), 403)
    return {'org_id': org_id, 'role': role}, None


def audit_append(conn, org_id, actor_role, entity_type, entity_id, action, payload):
    cur = conn.execute('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1')
    prev = cur.fetchone()
    prev_hash = prev['hash'] if prev else 'GENESIS'
    row_data = {
        'org_id': org_id,
        'actor_role': actor_role,
        'entity_type': entity_type,
        'entity_id': entity_id,
        'action': action,
        'payload': payload,
        'ts': now_iso()
    }
    msg = prev_hash + json.dumps(row_data, sort_keys=True)
    h = hashlib.sha256(msg.encode('utf-8')).hexdigest()
    conn.execute(
        'INSERT INTO audit_events(org_id, actor_role, entity_type, entity_id, action, payload_json, prev_hash, hash, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        (org_id, actor_role, entity_type, entity_id, action, json.dumps(payload), prev_hash, h, row_data['ts'])
    )


def init_db():
    conn = db()
    conn.execute('CREATE TABLE IF NOT EXISTS incidents(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, title TEXT, assignee TEXT, status TEXT, created_at TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS changes(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, title TEXT, status TEXT, created_at TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS sla_timers(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, incident_id INTEGER, due_at TEXT, status TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS sla_events(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, incident_id INTEGER, event_type TEXT, created_at TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, source TEXT, text TEXT, created_at TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, actor_role TEXT, entity_type TEXT, entity_id TEXT, action TEXT, payload_json TEXT, prev_hash TEXT, hash TEXT, created_at TEXT)')
    conn.commit()
    conn.close()


@app.get('/health')
def health():
    return jsonify({'status': 'UP', 'service': 'serviceops-gateway', 'timestamp': now_iso()})


@app.post('/api/v1/auth/token')
def token():
    payload = request.get_json(silent=True) or {}
    org_id = payload.get('orgId', 'demo-org')
    role = payload.get('role', 'agent')
    return jsonify({'token': f'demo.{org_id}.{role}', 'orgId': org_id, 'role': role})


@app.post('/api/v1/incidents')
def create_incident():
    scope, err = require_scope()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    title = payload.get('title', '').strip()
    if not title:
        return jsonify({'code': 'INVALID_REQUEST', 'message': 'title is required'}), 400
    assignee = 'tier1-oncall'
    created = now_iso()
    conn = db()
    cur = conn.execute('INSERT INTO incidents(org_id, title, assignee, status, created_at) VALUES(?,?,?,?,?)', (scope['org_id'], title, assignee, 'OPEN', created))
    incident_id = cur.lastrowid
    due = (datetime.datetime.utcnow() + datetime.timedelta(seconds=3)).isoformat() + 'Z'
    conn.execute('INSERT INTO sla_timers(org_id, incident_id, due_at, status) VALUES(?,?,?,?)', (scope['org_id'], incident_id, due, 'RUNNING'))
    audit_append(conn, scope['org_id'], scope['role'], 'incident', str(incident_id), 'created', {'title': title, 'assignee': assignee})
    conn.commit()
    conn.close()
    return jsonify({'id': incident_id, 'title': title, 'assignee': assignee, 'status': 'OPEN'})


@app.post('/api/v1/sla/tick')
def sla_tick():
    scope, err = require_scope()
    if err:
        return err
    conn = db()
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    rows = conn.execute('SELECT id, incident_id, due_at FROM sla_timers WHERE org_id=? AND status=?', (scope['org_id'], 'RUNNING')).fetchall()
    breaches = 0
    for r in rows:
        if r['due_at'] <= now:
            conn.execute('UPDATE sla_timers SET status=? WHERE id=?', ('BREACHED', r['id']))
            conn.execute('INSERT INTO sla_events(org_id, incident_id, event_type, created_at) VALUES(?,?,?,?)', (scope['org_id'], r['incident_id'], 'sla.breached', now_iso()))
            audit_append(conn, scope['org_id'], scope['role'], 'sla', str(r['incident_id']), 'breached', {'incidentId': r['incident_id']})
            breaches += 1
    conn.commit()
    conn.close()
    return jsonify({'processed': len(rows), 'breaches': breaches})


@app.get('/api/v1/sla/events')
def get_sla_events():
    scope, err = require_scope()
    if err:
        return err
    conn = db()
    rows = conn.execute('SELECT incident_id, event_type, created_at FROM sla_events WHERE org_id=? ORDER BY id', (scope['org_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/api/v1/changes')
def create_change():
    scope, err = require_scope()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    title = payload.get('title', '').strip()
    if not title:
        return jsonify({'code': 'INVALID_REQUEST', 'message': 'title is required'}), 400
    conn = db()
    cur = conn.execute('INSERT INTO changes(org_id, title, status, created_at) VALUES(?,?,?,?)', (scope['org_id'], title, 'PENDING_APPROVAL', now_iso()))
    cid = cur.lastrowid
    audit_append(conn, scope['org_id'], scope['role'], 'change', str(cid), 'created', {'title': title, 'status': 'PENDING_APPROVAL'})
    conn.commit()
    conn.close()
    return jsonify({'id': cid, 'status': 'PENDING_APPROVAL'})


@app.post('/api/v1/workflow/changes/<int:change_id>/approve')
def approve_change(change_id):
    scope, err = require_scope()
    if err:
        return err
    if scope['role'] not in ('manager', 'admin'):
        return jsonify({'code': 'FORBIDDEN', 'message': 'approval requires manager/admin role'}), 403
    conn = db()
    row = conn.execute('SELECT id, status FROM changes WHERE id=? AND org_id=?', (change_id, scope['org_id'])).fetchone()
    if not row:
        conn.close()
        return jsonify({'code': 'NOT_FOUND', 'message': 'change not found'}), 404
    if row['status'] != 'PENDING_APPROVAL':
        conn.close()
        return jsonify({'code': 'INVALID_STATE', 'message': 'change is not pending approval'}), 409
    conn.execute('UPDATE changes SET status=? WHERE id=?', ('APPROVED', change_id))
    audit_append(conn, scope['org_id'], scope['role'], 'change', str(change_id), 'approved', {'status': 'APPROVED'})
    conn.commit()
    conn.close()
    return jsonify({'id': change_id, 'status': 'APPROVED'})


@app.get('/api/v1/audit/validate')
def audit_validate():
    scope, err = require_scope()
    if err:
        return err
    conn = db()
    rows = conn.execute('SELECT * FROM audit_events WHERE org_id=? ORDER BY id', (scope['org_id'],)).fetchall()
    prev = 'GENESIS'
    valid = True
    for r in rows:
        payload = {
            'org_id': r['org_id'],
            'actor_role': r['actor_role'],
            'entity_type': r['entity_type'],
            'entity_id': r['entity_id'],
            'action': r['action'],
            'payload': json.loads(r['payload_json']),
            'ts': r['created_at']
        }
        expected = hashlib.sha256((prev + json.dumps(payload, sort_keys=True)).encode('utf-8')).hexdigest()
        if r['prev_hash'] != prev or r['hash'] != expected:
            valid = False
            break
        prev = r['hash']
    conn.close()
    return jsonify({'valid': valid, 'events': len(rows)})


@app.post('/api/v1/rag/upload')
def upload_doc():
    scope, err = require_scope()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    text = payload.get('text', '').strip()
    source = payload.get('source', 'unknown')
    if not text:
        return jsonify({'code': 'INVALID_REQUEST', 'message': 'text is required'}), 400
    conn = db()
    cur = conn.execute('INSERT INTO documents(org_id, source, text, created_at) VALUES(?,?,?,?)', (scope['org_id'], source, text, now_iso()))
    did = cur.lastrowid
    audit_append(conn, scope['org_id'], scope['role'], 'knowledge', str(did), 'uploaded', {'source': source})
    conn.commit()
    conn.close()
    return jsonify({'documentId': did, 'status': 'indexed'})


def redact_pii(text):
    text = re.sub(r'[\w\.-]+@[\w\.-]+', '[REDACTED_EMAIL]', text)
    text = re.sub(r'\b\d{10}\b', '[REDACTED_PHONE]', text)
    return text


@app.post('/api/v1/rag/ask')
def ask_rag():
    scope, err = require_scope()
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    q = payload.get('question', '').strip()
    if not q:
        return jsonify({'code': 'INVALID_REQUEST', 'message': 'question is required'}), 400
    conn = db()
    row = conn.execute('SELECT id, source, text FROM documents WHERE org_id=? ORDER BY id DESC LIMIT 1', (scope['org_id'],)).fetchone()
    if not row:
        conn.close()
        return jsonify({'code': 'NOT_FOUND', 'message': 'no indexed documents'}), 404
    evidence = redact_pii(row['text'])
    # Simple prompt-injection mitigation: ignore embedded instructions from content.
    answer = 'Evidence indicates: ' + evidence[:180]
    citations = [{'id': f"doc-{row['id']}", 'source': row['source'], 'span': {'start': 0, 'end': min(80, len(evidence))}, 'snippet': evidence[:80]}]
    audit_append(conn, scope['org_id'], scope['role'], 'knowledge', str(row['id']), 'asked', {'question': q})
    conn.commit()
    conn.close()
    return jsonify({'answer': answer, 'citations': citations, 'evidenceOnly': True})


@app.get('/api/v1/postmortem/export')
def postmortem_export():
    scope, err = require_scope()
    if err:
        return err
    conn = db()
    incident_count = conn.execute('SELECT COUNT(*) c FROM incidents WHERE org_id=?', (scope['org_id'],)).fetchone()['c']
    breach_count = conn.execute('SELECT COUNT(*) c FROM sla_events WHERE org_id=? AND event_type=?', (scope['org_id'], 'sla.breached')).fetchone()['c']
    conn.close()
    return jsonify({'orgId': scope['org_id'], 'incidents': incident_count, 'breaches': breach_count, 'exportedAt': now_iso()})


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8080)
