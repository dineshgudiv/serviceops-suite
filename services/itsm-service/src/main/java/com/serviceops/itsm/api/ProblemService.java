package com.serviceops.itsm.api;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class ProblemService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public ProblemService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public List<Map<String, Object>> list(Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem queue access");
    String orgKey = jwt.getClaimAsString("orgKey");
    return jdbc.queryForList("""
      SELECT id,org_key,title,status,owner,service_key,summary,root_cause,known_error,created_at,updated_at
      FROM itsm.problems
      WHERE org_key=?
      ORDER BY id DESC
      """, orgKey).stream().map(this::mapProblem).map(this::toResponse).toList();
  }

  public Map<String, Object> create(Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem creation");
    String orgKey = jwt.getClaimAsString("orgKey");
    String title = body.getOrDefault("title", "").trim();
    if (title.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_TITLE_REQUIRED", "Problem title is required");
    }
    String summary = body.getOrDefault("summary", body.getOrDefault("description", "")).trim();
    if (summary.length() < 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_DESCRIPTION_REQUIRED", "Problem description must be at least 12 characters");
    }
    String impactSummary = body.getOrDefault("impact_summary", body.getOrDefault("impactSummary", "")).trim();
    String rootCause = body.getOrDefault("root_cause", body.getOrDefault("suspected_root_cause", body.getOrDefault("suspectedRootCause", ""))).trim();
    Long id = jdbc.queryForObject("""
      INSERT INTO itsm.problems(org_key,title,status,owner,service_key,summary,impact_summary,root_cause,known_error,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?, now())
      RETURNING id
      """, Long.class,
      orgKey,
      title,
      ProblemStatus.CREATED.name(),
      body.getOrDefault("owner", jwt.getSubject()),
      body.getOrDefault("service_key", ""),
      summary,
      impactSummary,
      rootCause,
      "");
    if (!body.getOrDefault("incident_id", "").isBlank()) {
      linkIncident(id, jwt, Long.valueOf(body.get("incident_id")), req);
    }
    ProblemRecord problem = getProblem(orgKey, id);
    emitAudit("problem.created", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "create",
      "targetType", "problem",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of(),
      "after", toAuditState(problem)
    ));
    return toResponse(problem);
  }

  public Map<String, Object> updateOwner(Long id, Jwt jwt, Map<String, String> body) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem ownership update");
    String owner = body.getOrDefault("owner", "").trim();
    if (owner.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_OWNER_REQUIRED", "Owner is required");
    }
    int changed = jdbc.update("""
      UPDATE itsm.problems
      SET owner=?, updated_at=now()
      WHERE org_key=? AND id=?
      """, owner, jwt.getClaimAsString("orgKey"), id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "Problem not found");
    }
    return toResponse(getProblem(jwt.getClaimAsString("orgKey"), id));
  }

  public Map<String, Object> linkIncident(Long problemId, Jwt jwt, Long incidentId, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem incident linkage");
    String orgKey = jwt.getClaimAsString("orgKey");
    ProblemRecord before = getProblem(orgKey, problemId);
    if (!before.status().canTransitionTo(ProblemStatus.INCIDENT_LINKED)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_INVALID_TRANSITION", "Illegal problem transition: " + before.status().name() + " -> " + ProblemStatus.INCIDENT_LINKED.name());
    }
    assertIncidentExists(orgKey, incidentId);
    jdbc.update("""
      INSERT INTO itsm.problem_incidents(problem_id, incident_id)
      VALUES (?,?)
      ON CONFLICT DO NOTHING
      """, problemId, incidentId);
    jdbc.update("""
      UPDATE itsm.problems
      SET status=?, updated_at=now()
      WHERE org_key=? AND id=?
      """, ProblemStatus.INCIDENT_LINKED.name(), orgKey, problemId);
    ProblemRecord after = getProblem(orgKey, problemId);
    emitAudit("problem.incident_linked", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "link_incident",
      "targetType", "problem",
      "targetId", problemId,
      "incidentId", incidentId,
      "timestamp", OffsetDateTime.now().toString(),
      "before", toAuditState(before),
      "after", toAuditState(after)
    ));
    return toResponse(after);
  }

  public Map<String, Object> identifyRootCause(Long id, Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem root-cause update");
    return transitionWithText(id, jwt, req, ProblemStatus.ROOT_CAUSE_IDENTIFIED, "problem.root_cause_recorded", "root_cause", body.getOrDefault("rootCause", body.getOrDefault("root_cause", "")).trim());
  }

  public Map<String, Object> markKnownError(Long id, Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem known-error update");
    return transitionWithText(id, jwt, req, ProblemStatus.KNOWN_ERROR, "problem.known_error_marked", "known_error", body.getOrDefault("knownError", body.getOrDefault("known_error", "")).trim());
  }

  public Map<String, Object> close(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Problem closure");
    String orgKey = jwt.getClaimAsString("orgKey");
    ProblemRecord before = getProblem(orgKey, id);
    if (!before.status().canTransitionTo(ProblemStatus.CLOSED)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_INVALID_TRANSITION", "Illegal problem transition: " + before.status().name() + " -> " + ProblemStatus.CLOSED.name());
    }
    jdbc.update("UPDATE itsm.problems SET status=?, updated_at=now() WHERE org_key=? AND id=?", ProblemStatus.CLOSED.name(), orgKey, id);
    ProblemRecord after = getProblem(orgKey, id);
    emitAudit("problem.closed", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "close",
      "targetType", "problem",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", toAuditState(before),
      "after", toAuditState(after)
    ));
    return toResponse(after);
  }

  private Map<String, Object> transitionWithText(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req, ProblemStatus target, String eventType, String field, String value) {
    if (value.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_TEXT_REQUIRED", "Required problem detail is missing");
    }
    String orgKey = jwt.getClaimAsString("orgKey");
    ProblemRecord before = getProblem(orgKey, id);
    if (!before.status().canTransitionTo(target)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PROBLEM_INVALID_TRANSITION", "Illegal problem transition: " + before.status().name() + " -> " + target.name());
    }
    String sql = "UPDATE itsm.problems SET status=?, " + field + "=?, updated_at=now() WHERE org_key=? AND id=?";
    int changed = jdbc.update(sql, target.name(), value, orgKey, id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "Problem not found");
    }
    ProblemRecord after = getProblem(orgKey, id);
    emitAudit(eventType, orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", eventType,
      "targetType", "problem",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", toAuditState(before),
      "after", toAuditState(after)
    ));
    return toResponse(after);
  }

  private void assertIncidentExists(String orgKey, Long incidentId) {
    Integer count = jdbc.queryForObject("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND id=?", Integer.class, orgKey, incidentId);
    if (count == null || count == 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_NOT_FOUND", "Incident not found for problem linkage");
    }
  }

  private ProblemRecord getProblem(String orgKey, Long id) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,org_key,title,status,owner,service_key,summary,impact_summary,root_cause,known_error,created_at,updated_at
      FROM itsm.problems
      WHERE org_key=? AND id=?
      """, orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "PROBLEM_NOT_FOUND", "Problem not found");
    }
    return mapProblem(rows.getFirst());
  }

  private ProblemRecord mapProblem(Map<String, Object> row) {
    Long id = ((Number) row.get("id")).longValue();
    String orgKey = Objects.toString(row.get("org_key"), "");
    List<Map<String, Object>> linked = jdbc.queryForList("""
      SELECT i.id, i.title
      FROM itsm.problem_incidents pi
      JOIN itsm.incidents i ON i.id=pi.incident_id
      WHERE pi.problem_id=? AND i.org_key=?
      ORDER BY i.id DESC
      """, id, orgKey);
    return new ProblemRecord(
      id,
      orgKey,
      Objects.toString(row.get("title"), ""),
      ProblemStatus.fromDb(Objects.toString(row.get("status"), ProblemStatus.CREATED.name())),
      Objects.toString(row.get("owner"), ""),
      Objects.toString(row.get("service_key"), ""),
      Objects.toString(row.get("summary"), ""),
      Objects.toString(row.get("impact_summary"), ""),
      Objects.toString(row.get("root_cause"), ""),
      Objects.toString(row.get("known_error"), ""),
      row.get("created_at"),
      row.get("updated_at"),
      linked
    );
  }

  private Map<String, Object> toResponse(ProblemRecord problem) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", problem.id());
    out.put("title", problem.title());
    out.put("status", problem.status().name());
    out.put("owner", blankToNull(problem.owner()));
    out.put("service", problem.serviceKey());
    out.put("service_key", problem.serviceKey());
    out.put("priority", "P2");
    out.put("created_at", problem.createdAt());
    out.put("updated_at", problem.updatedAt());
    out.put("summary", problem.summary());
    out.put("description", problem.summary());
    out.put("impact_summary", problem.impactSummary());
    out.put("rca_summary", problem.rootCause());
    out.put("known_error", problem.knownError());
    out.put("linked_incidents", problem.linkedIncidents().stream().map(li -> Map.of("id", String.valueOf(li.get("id")), "title", Objects.toString(li.get("title"), ""))).toList());
    out.put("affected_cis", List.of());
    out.put("evidence", "");
    out.put("citations", List.of());
    return out;
  }

  private Map<String, Object> toAuditState(ProblemRecord problem) {
    return Map.of(
      "id", problem.id(),
      "status", problem.status().name(),
      "owner", problem.owner() == null ? "" : problem.owner(),
      "service_key", problem.serviceKey() == null ? "" : problem.serviceKey(),
      "linked_incident_count", problem.linkedIncidents().size(),
      "impact_summary", problem.impactSummary() == null ? "" : problem.impactSummary(),
      "root_cause", problem.rootCause() == null ? "" : problem.rootCause(),
      "known_error", problem.knownError() == null ? "" : problem.knownError()
    );
  }

  private void emitAudit(String eventType, String orgKey, jakarta.servlet.http.HttpServletRequest req, Map<String, Object> payload) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);
      headers.set("X-Request-ID", String.valueOf(req.getAttribute("request_id")));
      rest.postForEntity(
        auditBaseUrl + "/api/audit/events",
        new HttpEntity<>(Map.of("orgKey", orgKey, "eventType", eventType, "payload", payload), headers),
        Map.class);
    } catch (RestClientException ex) {
      throw ApiException.badGateway("Audit downstream call failed");
    }
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
