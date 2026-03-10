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
public class RequesterPortalService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public RequesterPortalService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public List<Map<String, Object>> listMyRequests(Jwt jwt, String q) {
    String orgKey = jwt.getClaimAsString("orgKey");
    String actor = jwt.getSubject();
    String like = "%" + Objects.toString(q, "").trim().toLowerCase() + "%";

    List<Map<String, Object>> incidents = jdbc.queryForList("""
      SELECT id, title, status, severity, updated_at, created_at, 'INCIDENT' AS item_type
      FROM itsm.incidents
      WHERE org_key=?
        AND created_by=?
        AND (? = '%%' OR LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
      ORDER BY updated_at DESC, id DESC
      """, orgKey, actor, like, like, like);

    List<Map<String, Object>> requests = jdbc.queryForList("""
      SELECT id, short_description AS title, status, NULL::text AS severity, updated_at, created_at, 'SERVICE_REQUEST' AS item_type
      FROM itsm.service_requests
      WHERE org_key=?
        AND created_by_user_id=?
        AND (? = '%%' OR LOWER(short_description) LIKE ? OR LOWER(justification) LIKE ?)
      ORDER BY updated_at DESC, id DESC
      """, orgKey, actor, like, like, like);

    return java.util.stream.Stream.concat(incidents.stream(), requests.stream())
      .map(this::toPortalListItem)
      .sorted((a, b) -> Objects.toString(b.get("updated_at"), "").compareTo(Objects.toString(a.get("updated_at"), "")))
      .toList();
  }

  public Map<String, Object> getRequest(Jwt jwt, String kind, Long id) {
    String normalizedKind = normalizeKind(kind);
    String orgKey = jwt.getClaimAsString("orgKey");
    String actor = jwt.getSubject();
    if ("incident".equals(normalizedKind)) {
      List<Map<String, Object>> rows = jdbc.queryForList("""
        SELECT id,title,description,status,severity,impact,urgency,category,service_key,ci_key,attachment_name,created_at,updated_at,resolved_at,assigned_to
        FROM itsm.incidents
        WHERE org_key=? AND id=? AND created_by=?
        """, orgKey, id, actor);
      if (rows.isEmpty()) {
        throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_NOT_FOUND", "Request not found");
      }
      Map<String, Object> row = rows.getFirst();
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("kind", "incident");
      out.put("id", "INC-" + row.get("id"));
      out.put("numeric_id", row.get("id"));
      out.put("title", row.get("title"));
      out.put("description", row.get("description"));
      out.put("status", row.get("status"));
      out.put("priority", row.get("severity"));
      out.put("impact", row.get("impact"));
      out.put("urgency", row.get("urgency"));
      out.put("category", row.get("category"));
      out.put("service_key", row.get("service_key"));
      out.put("ci_key", row.get("ci_key"));
      out.put("attachment_name", row.get("attachment_name"));
      out.put("created_at", row.get("created_at"));
      out.put("updated_at", row.get("updated_at"));
      out.put("resolved_at", row.get("resolved_at"));
      out.put("assignee", row.get("assigned_to"));
      out.put("resolution", "RESOLVED".equals(String.valueOf(row.get("status"))) || "CLOSED".equals(String.valueOf(row.get("status"))) ? row.get("description") : null);
      out.put("comments", listComments(jwt, "incident", id));
      return out;
    }

    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,service_key,short_description,justification,status,assigned_to,attachment_name,approval_target,resolution_summary,created_at,updated_at,fulfilled_at,closed_at
      FROM itsm.service_requests
      WHERE org_key=? AND id=? AND created_by_user_id=?
      """, orgKey, id, actor);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_NOT_FOUND", "Request not found");
    }
    Map<String, Object> row = rows.getFirst();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("kind", "service-request");
    out.put("id", "SR-" + row.get("id"));
    out.put("numeric_id", row.get("id"));
    out.put("title", row.get("short_description"));
    out.put("description", row.get("justification"));
    out.put("status", row.get("status"));
    out.put("service_key", row.get("service_key"));
    out.put("assignee", row.get("assigned_to"));
    out.put("approval_target", row.get("approval_target"));
    out.put("attachment_name", row.get("attachment_name"));
    out.put("resolution", emptyToNull(Objects.toString(row.get("resolution_summary"), "")));
    out.put("created_at", row.get("created_at"));
    out.put("updated_at", row.get("updated_at"));
    out.put("comments", listComments(jwt, "service-request", id));
    return out;
  }

  public List<Map<String, Object>> listComments(Jwt jwt, String kind, Long id) {
    verifyOwnership(jwt, kind, id);
    String orgKey = jwt.getClaimAsString("orgKey");
    String sql = "incident".equals(normalizeKind(kind))
      ? """
        SELECT id, entry_type, actor, summary, details, created_at
        FROM itsm.timeline_entries
        WHERE org_key=? AND incident_id=?
        ORDER BY created_at ASC, id ASC
        """
      : """
        SELECT id, entry_type, actor, summary, details, created_at
        FROM itsm.timeline_entries
        WHERE org_key=? AND service_request_id=?
        ORDER BY created_at ASC, id ASC
        """;
    return jdbc.queryForList(sql, orgKey, id).stream().map(row -> {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("id", row.get("id"));
      out.put("entry_type", row.get("entry_type"));
      out.put("actor", row.get("actor"));
      out.put("summary", row.get("summary"));
      out.put("details", row.get("details"));
      out.put("created_at", row.get("created_at"));
      return out;
    }).toList();
  }

  public Map<String, Object> addComment(Jwt jwt, String kind, Long id, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    verifyOwnership(jwt, kind, id);
    String summary = Objects.toString(body.get("summary"), "").trim();
    String details = Objects.toString(body.get("details"), "").trim();
    if (summary.isBlank() && details.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "COMMENT_REQUIRED", "Comment summary or details is required");
    }
    String orgKey = jwt.getClaimAsString("orgKey");
    if ("incident".equals(normalizeKind(kind))) {
      jdbc.update("""
        INSERT INTO itsm.timeline_entries(org_key,incident_id,entry_type,actor,summary,details)
        VALUES (?,?,?,?,?,?)
        """, orgKey, id, "REQUESTER_COMMENT", jwt.getSubject(), summary.isBlank() ? "Requester update" : summary, details);
      jdbc.update("UPDATE itsm.incidents SET updated_at=now() WHERE org_key=? AND id=?", orgKey, id);
    } else {
      jdbc.update("""
        INSERT INTO itsm.timeline_entries(org_key,service_request_id,entry_type,actor,summary,details)
        VALUES (?,?,?,?,?,?)
        """, orgKey, id, "REQUESTER_COMMENT", jwt.getSubject(), summary.isBlank() ? "Requester update" : summary, details);
      jdbc.update("UPDATE itsm.service_requests SET updated_at=now() WHERE org_key=? AND id=?", orgKey, id);
    }
    emitAudit("requester.comment_added", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "comment",
      "targetType", normalizeKind(kind),
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "after", Map.of("summary", summary, "details", details)
    ));
    return Map.of("ok", true);
  }

  private void verifyOwnership(Jwt jwt, String kind, Long id) {
    if (RoleGuard.isAnalystOrAdmin(jwt)) {
      return;
    }
    String orgKey = jwt.getClaimAsString("orgKey");
    String actor = jwt.getSubject();
    Integer count = "incident".equals(normalizeKind(kind))
      ? jdbc.queryForObject("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND id=? AND created_by=?", Integer.class, orgKey, id, actor)
      : jdbc.queryForObject("SELECT count(*) FROM itsm.service_requests WHERE org_key=? AND id=? AND created_by_user_id=?", Integer.class, orgKey, id, actor);
    if (count == null || count == 0) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_REQUEST", "You do not have access to this request");
    }
  }

  private String normalizeKind(String kind) {
    String normalized = Objects.toString(kind, "").trim().toLowerCase();
    if ("incident".equals(normalized) || "service-request".equals(normalized)) {
      return normalized;
    }
    throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_KIND_INVALID", "Request kind must be incident or service-request");
  }

  private Map<String, Object> toPortalListItem(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>();
    String itemType = Objects.toString(row.get("item_type"), "");
    boolean incident = "INCIDENT".equals(itemType);
    out.put("kind", incident ? "incident" : "service-request");
    out.put("id", (incident ? "INC-" : "SR-") + row.get("id"));
    out.put("numeric_id", row.get("id"));
    out.put("title", row.get("title"));
    out.put("type", incident ? "Incident" : "Service Request");
    out.put("status", row.get("status"));
    out.put("priority", row.get("severity"));
    out.put("updated_at", row.get("updated_at"));
    out.put("created_at", row.get("created_at"));
    return out;
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

  private Object emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
