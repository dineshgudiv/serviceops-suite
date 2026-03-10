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
public class ChangeService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public ChangeService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public List<Map<String, Object>> list(Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change queue access");
    return jdbc.queryForList("""
      SELECT id,org_key,title,status,risk,created_at,updated_at,service_key,ci_key,owner,environment,requested_by,
             approved_by,rejected_by,plan,rollback_plan,preview_command,change_window_start,change_window_end,
             approved_at,rejected_at,implemented_at,reviewed_at
      FROM itsm.changes
      WHERE org_key=?
      ORDER BY id DESC
      """, jwt.getClaimAsString("orgKey")).stream().map(this::mapChange).map(this::toResponse).toList();
  }

  public Map<String, Object> createDraft(Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change draft creation");
    String orgKey = jwt.getClaimAsString("orgKey");
    String title = body.getOrDefault("title", "").trim();
    if (title.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_TITLE_REQUIRED", "Change title is required");
    }
    String description = body.getOrDefault("description", "").trim();
    if (description.length() < 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_DESCRIPTION_REQUIRED", "Change description must be at least 12 characters");
    }
    String reason = body.getOrDefault("reason", "").trim();
    if (reason.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_REASON_REQUIRED", "Change reason must be at least 8 characters");
    }
    String rollbackPlan = body.getOrDefault("rollback_plan", "").trim();
    if (rollbackPlan.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_ROLLBACK_PLAN_REQUIRED", "Rollback plan must be at least 8 characters");
    }
    if (body.getOrDefault("change_window_start", "").isBlank() || body.getOrDefault("change_window_end", "").isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_WINDOW_REQUIRED", "Scheduled window start and end are required");
    }
    Long id = jdbc.queryForObject("""
      INSERT INTO itsm.changes(org_key,title,status,risk,service_key,ci_key,environment,owner,requested_by,description,reason,plan,rollback_plan,preview_command,change_window_start,change_window_end,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now())
      RETURNING id
      """, Long.class,
      orgKey,
      title,
      ChangeStatus.DRAFT.name(),
      body.getOrDefault("risk", "P3"),
      body.getOrDefault("service_key", ""),
      body.getOrDefault("ci_key", ""),
      body.getOrDefault("environment", "prod"),
      body.getOrDefault("owner", jwt.getSubject()),
      jwt.getSubject(),
      description,
      reason,
      body.getOrDefault("plan", ""),
      rollbackPlan,
      body.getOrDefault("preview_command", ""),
      emptyToNull(body.get("change_window_start")),
      emptyToNull(body.get("change_window_end")));
    ChangeRecord change = getChange(orgKey, id);
    emitAudit("change.created", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "create",
      "targetType", "change",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of(),
      "after", toAuditState(change)
    ));
    return toResponse(change);
  }

  public Map<String, Object> updateOwner(Long id, Jwt jwt, Map<String, String> body) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change ownership update");
    String owner = body.getOrDefault("owner", "").trim();
    if (owner.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_OWNER_REQUIRED", "Owner is required");
    }
    int changed = jdbc.update("""
      UPDATE itsm.changes
      SET owner=?, updated_at=now()
      WHERE org_key=? AND id=?
      """, owner, jwt.getClaimAsString("orgKey"), id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "CHANGE_NOT_FOUND", "Change not found");
    }
    return toResponse(getChange(jwt.getClaimAsString("orgKey"), id));
  }

  public Map<String, Object> submit(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change submission");
    return transition(id, jwt, req, ChangeStatus.SUBMITTED, "change.submitted");
  }

  public Map<String, Object> implement(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change implementation");
    return transition(id, jwt, req, ChangeStatus.IMPLEMENTED, "change.implemented");
  }

  public Map<String, Object> review(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Change review");
    return transition(id, jwt, req, ChangeStatus.REVIEWED, "change.reviewed");
  }

  private Map<String, Object> transition(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req, ChangeStatus target, String eventType) {
    String orgKey = jwt.getClaimAsString("orgKey");
    ChangeRecord before = getChange(orgKey, id);
    if (!before.status().canTransitionTo(target)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_INVALID_TRANSITION", "Illegal change transition: " + before.status().name() + " -> " + target.name());
    }
    int changed = jdbc.update("""
      UPDATE itsm.changes
      SET status=?, updated_at=now(),
          implemented_at=CASE WHEN ?='IMPLEMENTED' THEN now() ELSE implemented_at END,
          reviewed_at=CASE WHEN ?='REVIEWED' THEN now() ELSE reviewed_at END
      WHERE org_key=? AND id=?
      """, target.name(), target.name(), target.name(), orgKey, id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "CHANGE_NOT_FOUND", "Change not found");
    }
    ChangeRecord after = getChange(orgKey, id);
    emitAudit(eventType, orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", eventType,
      "targetType", "change",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", toAuditState(before),
      "after", toAuditState(after)
    ));
    return toResponse(after);
  }

  private ChangeRecord getChange(String orgKey, Long id) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,org_key,title,status,risk,service_key,ci_key,environment,owner,requested_by,approved_by,rejected_by,description,reason,plan,rollback_plan,preview_command,
             change_window_start,change_window_end,created_at,updated_at,approved_at,rejected_at,implemented_at,reviewed_at
      FROM itsm.changes
      WHERE org_key=? AND id=?
      """, orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "CHANGE_NOT_FOUND", "Change not found");
    }
    return mapChange(rows.getFirst());
  }

  private ChangeRecord mapChange(Map<String, Object> row) {
    return new ChangeRecord(
      ((Number) row.get("id")).longValue(),
      Objects.toString(row.get("org_key"), ""),
      Objects.toString(row.get("title"), ""),
      ChangeStatus.fromDb(Objects.toString(row.get("status"), ChangeStatus.DRAFT.name())),
      Objects.toString(row.get("risk"), "P3"),
      Objects.toString(row.get("service_key"), ""),
      Objects.toString(row.get("ci_key"), ""),
      Objects.toString(row.get("environment"), "prod"),
      Objects.toString(row.get("owner"), ""),
      Objects.toString(row.get("requested_by"), ""),
      Objects.toString(row.get("approved_by"), ""),
      Objects.toString(row.get("rejected_by"), ""),
      Objects.toString(row.get("description"), ""),
      Objects.toString(row.get("reason"), ""),
      Objects.toString(row.get("plan"), ""),
      Objects.toString(row.get("rollback_plan"), ""),
      Objects.toString(row.get("preview_command"), ""),
      row.get("change_window_start"),
      row.get("change_window_end"),
      row.get("created_at"),
      row.get("updated_at"),
      row.get("approved_at"),
      row.get("rejected_at"),
      row.get("implemented_at"),
      row.get("reviewed_at"));
  }

  private Map<String, Object> toResponse(ChangeRecord change) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", change.id());
    out.put("title", change.title());
    out.put("status", change.status().name());
    out.put("priority", change.risk());
    out.put("risk", change.risk());
    out.put("service", change.serviceKey());
    out.put("service_key", change.serviceKey());
    out.put("ci_key", change.ciKey());
    out.put("environment", change.environment());
    out.put("owner", blankToNull(change.owner()));
    out.put("requester", blankToNull(change.requestedBy()));
    out.put("created_at", change.createdAt());
    out.put("updated_at", change.updatedAt());
    out.put("description", change.description());
    out.put("reason", change.reason());
    out.put("change_window_start", change.changeWindowStart());
    out.put("change_window_end", change.changeWindowEnd());
    out.put("plan", change.plan());
    out.put("rollback_plan", change.rollbackPlan());
    out.put("preview_command", change.previewCommand());
    out.put("approvals", List.of(
      Map.of(
        "approver", blankToFallback(change.approvedBy(), "CAB"),
        "status", approvalStatus(change.status()),
        "note", approvalNote(change)
      )
    ));
    out.put("activity", List.of());
    return out;
  }

  private Map<String, Object> toAuditState(ChangeRecord change) {
    return Map.of(
      "id", change.id(),
      "status", change.status().name(),
      "risk", change.risk(),
      "reason", change.reason() == null ? "" : change.reason(),
      "owner", change.owner() == null ? "" : change.owner(),
      "service_key", change.serviceKey() == null ? "" : change.serviceKey(),
      "ci_key", change.ciKey() == null ? "" : change.ciKey()
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

  private String approvalStatus(ChangeStatus status) {
    return switch (status) {
      case APPROVED, IMPLEMENTED, REVIEWED -> "APPROVED";
      case REJECTED -> "REJECTED";
      case SUBMITTED -> "PENDING";
      default -> "PENDING";
    };
  }

  private String approvalNote(ChangeRecord change) {
    if (change.status() == ChangeStatus.REJECTED) {
      return "Rejected by " + blankToFallback(change.rejectedBy(), "workflow");
    }
    if (change.status() == ChangeStatus.APPROVED || change.status() == ChangeStatus.IMPLEMENTED || change.status() == ChangeStatus.REVIEWED) {
      return "Approved by " + blankToFallback(change.approvedBy(), "workflow");
    }
    return "Awaiting CAB decision";
  }

  private Object emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private String blankToFallback(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }
}
