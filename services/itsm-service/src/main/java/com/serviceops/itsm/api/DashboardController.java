package com.serviceops.itsm.api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {
  private final JdbcTemplate jdbc;

  public DashboardController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/api/itsm/dashboard/summary")
  public Map<String, Object> summary(@AuthenticationPrincipal Jwt jwt) {
    String orgKey = jwt.getClaimAsString("orgKey");
    Integer openCount = jdbc.queryForObject(
      "SELECT count(*) FROM itsm.incidents WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED')",
      Integer.class,
      orgKey
    );
    Integer impactedCount = jdbc.queryForObject(
      """
      SELECT count(DISTINCT ci_key)
      FROM itsm.incidents
      WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED') AND COALESCE(ci_key,'') <> ''
      """,
      Integer.class,
      orgKey
    );
    Integer currentSlaBreaches = jdbc.queryForObject(
      """
      SELECT count(*)
      FROM itsm.incidents i
      JOIN sla.policies p ON p.org_key=i.org_key AND p.severity=i.severity
      WHERE i.org_key=?
        AND i.status NOT IN ('RESOLVED','CLOSED')
        AND i.created_at + make_interval(mins => p.target_minutes) < now()
      """,
      Integer.class,
      orgKey
    );
    Integer knowledgeCount = jdbc.queryForObject(
      "SELECT count(*) FROM knowledge.documents WHERE org_key=?",
      Integer.class,
      orgKey
    );
    Integer cmdbCount = jdbc.queryForObject(
      "SELECT count(*) FROM cmdb.cis WHERE org_key=?",
      Integer.class,
      orgKey
    );
    Integer audit24hCount = jdbc.queryForObject(
      "SELECT count(*) FROM audit.audit_events WHERE org_key=? AND created_at >= now() - interval '24 hours'",
      Integer.class,
      orgKey
    );

    List<Map<String, Object>> bySeverityRows = jdbc.queryForList(
      "SELECT severity, count(*) as cnt FROM itsm.incidents WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED') GROUP BY severity",
      orgKey
    );
    List<Map<String, Object>> problemsByStatusRows = jdbc.queryForList(
      "SELECT status, count(*) AS cnt FROM itsm.problems WHERE org_key=? GROUP BY status",
      orgKey
    );
    List<Map<String, Object>> changesByStatusRows = jdbc.queryForList(
      "SELECT status, count(*) AS cnt FROM itsm.changes WHERE org_key=? GROUP BY status",
      orgKey
    );
    List<Map<String, Object>> ticketsByServiceRows = jdbc.queryForList(
      """
      SELECT COALESCE(NULLIF(service_key,''), 'Unassigned') AS service_key, count(*) AS cnt
      FROM itsm.incidents
      WHERE org_key=?
      GROUP BY COALESCE(NULLIF(service_key,''), 'Unassigned')
      ORDER BY cnt DESC, service_key ASC
      LIMIT 5
      """,
      orgKey
    );
    List<Map<String, Object>> breachesByDayRows = jdbc.queryForList(
      """
      SELECT to_char(i.created_at, 'Dy') AS dow, count(*) AS cnt
      FROM itsm.incidents i
      JOIN sla.policies p ON p.org_key=i.org_key AND p.severity=i.severity
      WHERE i.org_key=?
        AND i.status NOT IN ('RESOLVED','CLOSED')
        AND i.created_at >= now() - interval '7 days'
        AND i.created_at + make_interval(mins => p.target_minutes) < now()
      GROUP BY to_char(i.created_at, 'Dy'), extract(isodow FROM i.created_at)
      ORDER BY extract(isodow FROM i.created_at)
      """,
      orgKey
    );
    Integer resolvedCount = jdbc.queryForObject(
      "SELECT count(*) FROM itsm.incidents WHERE org_key=? AND resolved_at IS NOT NULL",
      Integer.class,
      orgKey
    );
    Integer mttrMinutes = jdbc.queryForObject(
      """
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0))::int, 0)
      FROM itsm.incidents
      WHERE org_key=? AND resolved_at IS NOT NULL AND resolved_at >= created_at
      """,
      Integer.class,
      orgKey
    );

    Map<String, Integer> bySeverity = new HashMap<>();
    for (String s : List.of("P1","P2","P3","P4","P5")) bySeverity.put(s, 0);
    for (Map<String, Object> row : bySeverityRows) {
      String sev = String.valueOf(row.get("severity"));
      Integer cnt = ((Number) row.get("cnt")).intValue();
      bySeverity.put(sev, cnt);
    }

    Map<String, Integer> problemsByStatus = toStatusMap(
      List.of("CREATED", "INCIDENT_LINKED", "ROOT_CAUSE_IDENTIFIED", "KNOWN_ERROR", "CLOSED"),
      problemsByStatusRows
    );
    Map<String, Integer> changesByStatus = toStatusMap(
      List.of("DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "IMPLEMENTED", "REVIEWED"),
      changesByStatusRows
    );
    List<Map<String, Object>> ticketsByService = new ArrayList<>();
    for (Map<String, Object> row : ticketsByServiceRows) {
      ticketsByService.add(Map.of(
        "service", String.valueOf(row.get("service_key")),
        "count", ((Number) row.get("cnt")).intValue()
      ));
    }

    Map<String, Integer> breachesByDay = new LinkedHashMap<>();
    for (String day : List.of("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")) {
      breachesByDay.put(day, 0);
    }
    for (Map<String, Object> row : breachesByDayRows) {
      String day = String.valueOf(row.get("dow")).trim();
      if (breachesByDay.containsKey(day)) {
        breachesByDay.put(day, ((Number) row.get("cnt")).intValue());
      }
    }

    List<Map<String, Object>> recent = jdbc.queryForList(
      "SELECT id, title, severity, status, service_key, ci_key, created_at FROM itsm.incidents WHERE org_key=? ORDER BY id DESC LIMIT 10",
      orgKey
    );

    Map<String, Object> out = new HashMap<>();
    out.put("open_incidents_count", openCount == null ? 0 : openCount);
    out.put("mttr_minutes", mttrMinutes == null ? 0 : mttrMinutes);
    out.put("resolved_incidents_count", resolvedCount == null ? 0 : resolvedCount);
    out.put("current_sla_breaches_count", currentSlaBreaches == null ? 0 : currentSlaBreaches);
    out.put("sla_breach_pct", openCount == null || openCount == 0 ? 0.0 : ((currentSlaBreaches == null ? 0.0 : currentSlaBreaches.doubleValue()) / openCount.doubleValue()) * 100.0);
    out.put("systems_impacted_count", impactedCount == null ? 0 : impactedCount);
    out.put("knowledge_documents_count", knowledgeCount == null ? 0 : knowledgeCount);
    out.put("cmdb_ci_count", cmdbCount == null ? 0 : cmdbCount);
    out.put("audit_activity_24h_count", audit24hCount == null ? 0 : audit24hCount);
    out.put("incidents_by_severity", bySeverity);
    out.put("problems_by_status", problemsByStatus);
    out.put("changes_by_status", changesByStatus);
    out.put("tickets_by_service", ticketsByService);
    out.put("breaches_by_day", breachesByDay);
    out.put("recent_incidents", new ArrayList<>(recent));
    return out;
  }

  private Map<String, Integer> toStatusMap(List<String> statuses, List<Map<String, Object>> rows) {
    Map<String, Integer> out = new LinkedHashMap<>();
    for (String status : statuses) {
      out.put(status, 0);
    }
    for (Map<String, Object> row : rows) {
      String status = String.valueOf(row.get("status"));
      if (out.containsKey(status)) {
        out.put(status, ((Number) row.get("cnt")).intValue());
      }
    }
    return out;
  }
}
