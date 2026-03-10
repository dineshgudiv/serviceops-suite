package com.serviceops.itsm.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

@RestController
public class SituationController {
  private final JdbcTemplate jdbc;
  private final SituationCorrelationEngine correlationEngine;
  private final RestTemplate restTemplate;

  @Value("${app.auditBaseUrl}") private String auditBaseUrl;

  public SituationController(JdbcTemplate jdbc, SituationCorrelationEngine correlationEngine, RestTemplate restTemplate) {
    this.jdbc = jdbc;
    this.correlationEngine = correlationEngine;
    this.restTemplate = restTemplate;
  }

  @PostMapping("/api/itsm/alerts")
  public Map<String, Object> ingestAlert(@RequestBody Map<String, String> body, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    String orgKey = jwt.getClaimAsString("orgKey");
    String serviceKey = body.getOrDefault("service_key", "");
    String ciKey = body.getOrDefault("ci_key", "");
    String environment = body.getOrDefault("environment", "prod");
    String severity = body.getOrDefault("severity", "P3");
    String title = body.getOrDefault("title", "Untitled alert");
    String alertKey = body.getOrDefault("alert_key", UUID.randomUUID().toString());
    String fingerprint = correlationEngine.fingerprint(title, serviceKey, ciKey, environment, severity);

    jdbc.update("""
      INSERT INTO itsm.alert_events(org_key,alert_key,title,severity,status,source,service_key,ci_key,environment,fingerprint,details,last_seen_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,now())
      ON CONFLICT (org_key, alert_key) DO UPDATE SET
        title=EXCLUDED.title,
        severity=EXCLUDED.severity,
        status=EXCLUDED.status,
        source=EXCLUDED.source,
        service_key=EXCLUDED.service_key,
        ci_key=EXCLUDED.ci_key,
        environment=EXCLUDED.environment,
        fingerprint=EXCLUDED.fingerprint,
        details=EXCLUDED.details,
        last_seen_at=now()
      """, orgKey, alertKey, title, severity, body.getOrDefault("status", "OPEN"), body.getOrDefault("source", "manual"),
      serviceKey, ciKey, environment, fingerprint, body.getOrDefault("details", ""));

    Map<String, Object> alert = jdbc.queryForMap("""
      SELECT id,alert_key,title,severity,status,source,service_key,ci_key,environment,fingerprint,details,first_seen_at,last_seen_at
      FROM itsm.alert_events WHERE org_key=? AND alert_key=?
      """, orgKey, alertKey);

    Long situationId = correlate(orgKey, alert, jwt.getSubject(), req);
    return Map.of("alert_key", alertKey, "situation_id", situationId);
  }

  @GetMapping("/api/itsm/alerts")
  public List<Map<String, Object>> alerts(@AuthenticationPrincipal Jwt jwt) {
    return jdbc.queryForList("""
      SELECT id,alert_key,title,severity,status,source,service_key,ci_key,environment,details,first_seen_at,last_seen_at
      FROM itsm.alert_events WHERE org_key=? ORDER BY last_seen_at DESC
      """, jwt.getClaimAsString("orgKey"));
  }

  @GetMapping("/api/itsm/situations")
  public List<Map<String, Object>> situations(@AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT s.id,s.situation_key,s.title,s.status,s.severity,s.service_key,s.environment,s.summary,s.incident_id,s.created_at,s.updated_at,
      COUNT(sa.alert_id) AS alert_count
      FROM itsm.situations s
      LEFT JOIN itsm.situation_alerts sa ON sa.situation_id=s.id
      WHERE s.org_key=?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      """, orgKey);
    return rows.stream().map(row -> decorateSituation(orgKey, row)).toList();
  }

  @GetMapping("/api/itsm/situations/{id}")
  public Map<String, Object> situation(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,situation_key,title,status,severity,service_key,environment,summary,incident_id,created_at,updated_at
      FROM itsm.situations WHERE org_key=? AND id=?
      """, orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "SITUATION_NOT_FOUND", "Situation not found");
    }
    Map<String, Object> base = new LinkedHashMap<>(decorateSituation(orgKey, rows.getFirst()));
    base.put("alerts", jdbc.queryForList("""
      SELECT a.id,a.alert_key,a.title,a.severity,a.status,a.source,a.service_key,a.ci_key,a.environment,a.details,a.first_seen_at,a.last_seen_at
      FROM itsm.alert_events a
      JOIN itsm.situation_alerts sa ON sa.alert_id=a.id
      WHERE sa.situation_id=?
      ORDER BY a.last_seen_at DESC
      """, id));
    base.put("evidence", jdbc.queryForList("""
      SELECT id,source_type,summary,payload,created_at
      FROM itsm.evidence WHERE org_key=? AND entity_type='situation' AND entity_id=? ORDER BY created_at DESC
      """, orgKey, String.valueOf(id)));
    base.put("timeline", jdbc.queryForList("""
      SELECT id,entry_type,actor,summary,details,created_at
      FROM itsm.timeline_entries WHERE org_key=? AND situation_id=? ORDER BY created_at DESC
      """, orgKey, id));
    return base;
  }

  @PostMapping("/api/itsm/situations/{id}/merge")
  public Map<String, Object> merge(@PathVariable Long id, @RequestBody Map<String, Long> body, @AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    Long sourceId = body.get("source_situation_id");
    if (sourceId == null) {
      throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "SITUATION_SOURCE_REQUIRED", "source_situation_id is required");
    }
    jdbc.update("UPDATE itsm.situation_alerts SET situation_id=? WHERE situation_id=?", id, sourceId);
    jdbc.update("DELETE FROM itsm.situations WHERE org_key=? AND id=?", orgKey, sourceId);
    appendTimeline(orgKey, null, id, "situation.merged", jwt.getSubject(), "Merged situation " + sourceId + " into " + id, "");
    return situation(id, jwt);
  }

  @PostMapping("/api/itsm/situations/{id}/split")
  public Map<String, Object> split(@PathVariable Long id, @RequestBody Map<String, List<Long>> body, @AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    List<Long> alertIds = body.getOrDefault("alert_ids", List.of());
    if (alertIds.isEmpty()) {
      throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "SITUATION_ALERTS_REQUIRED", "alert_ids is required");
    }
    Long newId = jdbc.queryForObject("""
      INSERT INTO itsm.situations(org_key,situation_key,title,status,severity,service_key,environment,summary)
      SELECT org_key,?,title,status,severity,service_key,environment,summary
      FROM itsm.situations WHERE id=? RETURNING id
      """, Long.class, "sit-" + UUID.randomUUID(), id);
    for (Long alertId : alertIds) {
      jdbc.update("UPDATE itsm.situation_alerts SET situation_id=? WHERE situation_id=? AND alert_id=?", newId, id, alertId);
    }
    appendTimeline(orgKey, null, id, "situation.split", jwt.getSubject(), "Split alerts into situation " + newId, "");
    appendTimeline(orgKey, null, newId, "situation.created", jwt.getSubject(), "Created by split from " + id, "");
    return Map.of("source_situation_id", id, "new_situation_id", newId);
  }

  @PostMapping("/api/itsm/situations/{id}/relink-incident")
  public Map<String, Object> relinkIncident(@PathVariable Long id, @RequestBody Map<String, Long> body, @AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    Long incidentId = body.get("incident_id");
    jdbc.update("UPDATE itsm.situations SET incident_id=?, updated_at=now() WHERE org_key=? AND id=?", incidentId, orgKey, id);
    appendTimeline(orgKey, incidentId, id, "incident.relinked", jwt.getSubject(), "Linked incident " + incidentId + " to situation " + id, "");
    return situation(id, jwt);
  }

  @GetMapping("/api/itsm/rca/{incidentId}")
  public Map<String, Object> rca(@PathVariable Long incidentId, @AuthenticationPrincipal Jwt jwt) {
    return Map.of(
      "request_id", "deferred",
      "code", "NOT_IMPLEMENTED",
      "message", "Evidence-backed RCA ranking is deferred. Situation evidence is available for manual reconstruction."
    );
  }

  private Long correlate(String orgKey, Map<String, Object> alert, String actor, jakarta.servlet.http.HttpServletRequest req) {
    List<String> topologyNeighbors = jdbc.queryForList("""
      SELECT CASE WHEN from_ci_key=? THEN to_ci_key ELSE from_ci_key END AS neighbor
      FROM cmdb.relationships
      WHERE org_key=? AND (from_ci_key=? OR to_ci_key=?)
      """, String.class, String.valueOf(alert.get("ci_key")), orgKey, String.valueOf(alert.get("ci_key")), String.valueOf(alert.get("ci_key")));

    List<Map<String, Object>> activeSituations = jdbc.queryForList("""
      SELECT id,situation_key,title,status,severity,service_key,environment,summary,incident_id,created_at,updated_at
      FROM itsm.situations
      WHERE org_key=? AND status='OPEN'
      ORDER BY updated_at DESC
      """, orgKey);

    for (Map<String, Object> situation : activeSituations) {
      List<Map<String, Object>> recentChanges = jdbc.queryForList("""
        SELECT id,title,status,risk
        FROM itsm.changes
        WHERE org_key=? AND service_key=? AND environment=? AND updated_at >= now() - interval '4 hours'
        ORDER BY updated_at DESC
        """, orgKey, String.valueOf(alert.get("service_key")), String.valueOf(alert.get("environment")));
      if (correlationEngine.belongsToSituation(situation, alert, topologyNeighbors, recentChanges)) {
        attachAlertToSituation(orgKey, ((Number) situation.get("id")).longValue(), ((Number) alert.get("id")).longValue(), actor, recentChanges);
        return ((Number) situation.get("id")).longValue();
      }
    }

    Long newSituationId = jdbc.queryForObject("""
      INSERT INTO itsm.situations(org_key,situation_key,title,status,severity,service_key,environment,summary)
      VALUES (?,?,?,?,?,?,?,?) RETURNING id
      """, Long.class, orgKey, "sit-" + UUID.randomUUID(), alert.get("title"), "OPEN", alert.get("severity"),
      alert.get("service_key"), alert.get("environment"), correlationEngine.summarizeAlert(alert));
    attachAlertToSituation(orgKey, newSituationId, ((Number) alert.get("id")).longValue(), actor, List.of());
    appendAudit(orgKey, req, Map.of("situationId", newSituationId, "alertKey", alert.get("alert_key")), "situation.created");
    return newSituationId;
  }

  private void attachAlertToSituation(String orgKey, Long situationId, Long alertId, String actor, List<Map<String, Object>> recentChanges) {
    jdbc.update("""
      INSERT INTO itsm.situation_alerts(situation_id, alert_id)
      VALUES (?,?)
      ON CONFLICT DO NOTHING
      """, situationId, alertId);
    jdbc.update("UPDATE itsm.situations SET updated_at=now() WHERE id=?", situationId);
    jdbc.update("""
      INSERT INTO itsm.evidence(org_key,entity_type,entity_id,source_type,summary,payload)
      VALUES (?,?,?,?,?,?)
      """, orgKey, "situation", String.valueOf(situationId), "alert", "Alert linked to situation", "alert_id=" + alertId);
    appendTimeline(orgKey, null, situationId, "alert.correlated", actor, "Alert " + alertId + " correlated into situation", "");
    for (Map<String, Object> change : recentChanges) {
      jdbc.update("""
        INSERT INTO itsm.evidence(org_key,entity_type,entity_id,source_type,summary,payload)
        VALUES (?,?,?,?,?,?)
        """, orgKey, "situation", String.valueOf(situationId), "change", "Recent change considered during correlation", "change_id=" + change.get("id"));
    }
  }

  private void appendTimeline(String orgKey, Long incidentId, Long situationId, String entryType, String actor, String summary, String details) {
    jdbc.update("""
      INSERT INTO itsm.timeline_entries(org_key,incident_id,situation_id,entry_type,actor,summary,details)
      VALUES (?,?,?,?,?,?,?)
      """, orgKey, incidentId, situationId, entryType, actor, summary, details);
  }

  private void appendAudit(String orgKey, jakarta.servlet.http.HttpServletRequest req, Map<String, Object> payload, String eventType) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-Request-ID", String.valueOf(req.getAttribute("request_id")));
    restTemplate.postForEntity(auditBaseUrl + "/api/audit/events", new HttpEntity<>(Map.of(
      "orgKey", orgKey,
      "eventType", eventType,
      "payload", payload
    ), headers), Map.class);
  }

  private Map<String, Object> decorateSituation(String orgKey, Map<String, Object> row) {
    Long id = ((Number) row.get("id")).longValue();
    List<Map<String, Object>> recentEvidence = jdbc.queryForList("""
      SELECT source_type,summary,payload,created_at
      FROM itsm.evidence WHERE org_key=? AND entity_type='situation' AND entity_id=?
      ORDER BY created_at DESC LIMIT 5
      """, orgKey, String.valueOf(id));
    List<Map<String, Object>> recentAlerts = jdbc.queryForList("""
      SELECT a.id,a.alert_key,a.title,a.severity,a.status,a.source,a.service_key,a.ci_key,a.environment,a.last_seen_at
      FROM itsm.alert_events a
      JOIN itsm.situation_alerts sa ON sa.alert_id=a.id
      WHERE sa.situation_id=?
      ORDER BY a.last_seen_at DESC
      LIMIT 5
      """, id);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("alert_count", ((Number) row.getOrDefault("alert_count", recentAlerts.size())).intValue());
    out.put("alerts", recentAlerts);
    out.put("evidence", recentEvidence);
    out.put("recent_change_refs", recentEvidence.stream().filter(e -> "change".equals(e.get("source_type"))).toList());
    return out;
  }
}
