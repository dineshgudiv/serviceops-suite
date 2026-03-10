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
public class ServiceRequestService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public ServiceRequestService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public List<Map<String, Object>> list(Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Service request queue access");
    String orgKey = jwt.getClaimAsString("orgKey");
    return jdbc.queryForList("""
      SELECT id,org_key,service_key,short_description,justification,created_by_user_id,requester,approval_target,status,assigned_to,attachment_name,resolution_summary,
             approved_by,rejected_by,created_at,updated_at,approved_at,rejected_at,fulfilled_at,closed_at
      FROM itsm.service_requests
      WHERE org_key=?
      ORDER BY id DESC
      """, orgKey).stream().map(this::mapRequest).map(this::toResponse).toList();
  }

  public Map<String, Object> create(Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireRequesterOrOperator(jwt, "Service request creation");
    String orgKey = jwt.getClaimAsString("orgKey");
    String serviceKey = body.getOrDefault("service_key", "").trim();
    String shortDescription = body.getOrDefault("short_description", body.getOrDefault("shortDescription", "")).trim();
    String justification = body.getOrDefault("justification", "").trim();
    String requester = body.getOrDefault("requester", body.getOrDefault("requester_name", "")).trim();
    if (requester.isBlank()) {
      requester = jwt.getSubject();
    }
    if (serviceKey.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_KEY_REQUIRED", "Service selection is required");
    }
    if (shortDescription.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_SHORT_DESCRIPTION_REQUIRED", "Short description must be at least 8 characters");
    }
    if (justification.length() < 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_JUSTIFICATION_REQUIRED", "Justification must be at least 12 characters");
    }
    if (requester.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_REQUESTER_REQUIRED", "Requester is required");
    }
    assertCatalogServiceExists(orgKey, serviceKey);
    Long id = jdbc.queryForObject("""
      INSERT INTO itsm.service_requests(org_key,service_key,short_description,justification,created_by_user_id,requester,approval_target,status,attachment_name,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,now())
      RETURNING id
      """, Long.class,
      orgKey,
      serviceKey,
      shortDescription,
      justification,
      jwt.getSubject(),
      requester,
      emptyToNull(body.get("approval_target")),
      ServiceRequestStatus.SUBMITTED.name(),
      emptyToNull(body.get("attachment_name")));
    ServiceRequestRecord request = getRequest(orgKey, id);
    appendComment(orgKey, id, jwt.getSubject(), "REQUEST_CREATED", shortDescription, justification);
    emitAudit("service_request.created", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "create",
      "targetType", "service_request",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of(),
      "after", Map.of(
        "service_key", request.serviceKey(),
        "status", request.status(),
        "requester", request.requester()
      )
    ));
    return toResponse(request);
  }

  public Map<String, Object> assign(Long id, Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Service request assignment");
    String orgKey = jwt.getClaimAsString("orgKey");
    ServiceRequestRecord before = getRequest(orgKey, id);
    if (ServiceRequestStatus.CLOSED.name().equals(before.status())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_CLOSED", "Closed service requests cannot be reassigned");
    }
    String assignee = Objects.toString(body.get("assignee"), "").trim();
    if (assignee.isBlank()) {
      assignee = jwt.getSubject();
    }
    jdbc.update("""
      UPDATE itsm.service_requests
      SET assigned_to=?, updated_at=now()
      WHERE org_key=? AND id=?
      """, assignee, orgKey, id);
    appendComment(orgKey, id, jwt.getSubject(), "ASSIGNED", "Assigned to " + assignee, "");
    ServiceRequestRecord after = getRequest(orgKey, id);
    emitAudit("service_request.assigned", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "assign",
      "targetType", "service_request",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of("assigned_to", emptyToNull(before.assignedTo())),
      "after", Map.of("assigned_to", emptyToNull(after.assignedTo()))
    ));
    return toResponse(after);
  }

  public Map<String, Object> approve(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return transition(id, jwt, req, ServiceRequestStatus.APPROVED, "service_request.approved", "");
  }

  public Map<String, Object> reject(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return transition(id, jwt, req, ServiceRequestStatus.REJECTED, "service_request.rejected", "");
  }

  public Map<String, Object> fulfill(Long id, Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    String resolution = Objects.toString(body.get("resolution_summary"), "").trim();
    if (resolution.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_RESOLUTION_REQUIRED", "Fulfillment summary must be at least 8 characters");
    }
    return transition(id, jwt, req, ServiceRequestStatus.FULFILLED, "service_request.fulfilled", resolution);
  }

  public Map<String, Object> close(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return transition(id, jwt, req, ServiceRequestStatus.CLOSED, "service_request.closed", "");
  }

  public Map<String, Object> addAgentComment(Long id, Jwt jwt, Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Service request commenting");
    String summary = Objects.toString(body.get("summary"), "").trim();
    String details = Objects.toString(body.get("details"), "").trim();
    if (summary.isBlank() && details.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "COMMENT_REQUIRED", "Comment summary or details is required");
    }
    String orgKey = jwt.getClaimAsString("orgKey");
    getRequest(orgKey, id);
    appendComment(orgKey, id, jwt.getSubject(), "PUBLIC_NOTE", summary.isBlank() ? "Agent update" : summary, details);
    jdbc.update("UPDATE itsm.service_requests SET updated_at=now() WHERE org_key=? AND id=?", orgKey, id);
    emitAudit("service_request.comment_added", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "comment",
      "targetType", "service_request",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "after", Map.of("summary", summary, "details", details)
    ));
    return Map.of("ok", true);
  }

  private void assertCatalogServiceExists(String orgKey, String serviceKey) {
    Integer count = jdbc.queryForObject(
      "SELECT count(*) FROM itsm.catalog_services WHERE org_key=? AND service_key=?",
      Integer.class,
      orgKey,
      serviceKey);
    if (count == null || count == 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CATALOG_SERVICE_NOT_FOUND", "Selected catalog service was not found");
    }
  }

  private ServiceRequestRecord getRequest(String orgKey, Long id) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,org_key,service_key,short_description,justification,created_by_user_id,requester,approval_target,status,assigned_to,attachment_name,resolution_summary,
             approved_by,rejected_by,created_at,updated_at,approved_at,rejected_at,fulfilled_at,closed_at
      FROM itsm.service_requests
      WHERE org_key=? AND id=?
      """, orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "SERVICE_REQUEST_NOT_FOUND", "Service request not found");
    }
    return mapRequest(rows.getFirst());
  }

  private ServiceRequestRecord mapRequest(Map<String, Object> row) {
    return new ServiceRequestRecord(
      ((Number) row.get("id")).longValue(),
      Objects.toString(row.get("org_key"), ""),
      Objects.toString(row.get("service_key"), ""),
      Objects.toString(row.get("short_description"), ""),
      Objects.toString(row.get("justification"), ""),
      Objects.toString(row.get("created_by_user_id"), ""),
      Objects.toString(row.get("requester"), ""),
      Objects.toString(row.get("approval_target"), ""),
      Objects.toString(row.get("status"), ServiceRequestStatus.SUBMITTED.name()),
      Objects.toString(row.get("assigned_to"), ""),
      Objects.toString(row.get("attachment_name"), ""),
      Objects.toString(row.get("resolution_summary"), ""),
      Objects.toString(row.get("approved_by"), ""),
      Objects.toString(row.get("rejected_by"), ""),
      row.get("created_at"),
      row.get("updated_at"),
      row.get("approved_at"),
      row.get("rejected_at"),
      row.get("fulfilled_at"),
      row.get("closed_at"));
  }

  private Map<String, Object> toResponse(ServiceRequestRecord request) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", request.id());
    out.put("service_key", request.serviceKey());
    out.put("short_description", request.shortDescription());
    out.put("justification", request.justification());
    out.put("created_by_user_id", emptyToNull(request.createdByUserId()));
    out.put("requester", request.requester());
    out.put("approval_target", emptyToNull(request.approvalTarget()));
    out.put("status", request.status());
    out.put("assigned_to", emptyToNull(request.assignedTo()));
    out.put("attachment_name", emptyToNull(request.attachmentName()));
    out.put("resolution_summary", emptyToNull(request.resolutionSummary()));
    out.put("approved_by", emptyToNull(request.approvedBy()));
    out.put("rejected_by", emptyToNull(request.rejectedBy()));
    out.put("created_at", request.createdAt());
    out.put("updated_at", request.updatedAt());
    out.put("approved_at", request.approvedAt());
    out.put("rejected_at", request.rejectedAt());
    out.put("fulfilled_at", request.fulfilledAt());
    out.put("closed_at", request.closedAt());
    return out;
  }

  private void appendComment(String orgKey, Long requestId, String actor, String entryType, String summary, String details) {
    jdbc.update("""
      INSERT INTO itsm.timeline_entries(org_key,service_request_id,entry_type,actor,summary,details)
      VALUES (?,?,?,?,?,?)
      """, orgKey, requestId, entryType, actor, summary, details == null ? "" : details);
  }

  private Map<String, Object> transition(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req, ServiceRequestStatus targetStatus, String eventType, String resolutionSummary) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Service request transition");
    String orgKey = jwt.getClaimAsString("orgKey");
    ServiceRequestRecord before = getRequest(orgKey, id);
    ServiceRequestStatus current = ServiceRequestStatus.fromDb(before.status());
    if (!current.canTransitionTo(targetStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "SERVICE_REQUEST_INVALID_TRANSITION", "Illegal service request transition: " + current.name() + " -> " + targetStatus.name());
    }

    jdbc.update("""
      UPDATE itsm.service_requests
      SET status=?,
          resolution_summary=CASE WHEN ?='FULFILLED' THEN ? ELSE resolution_summary END,
          approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE approved_by END,
          rejected_by=CASE WHEN ?='REJECTED' THEN ? ELSE rejected_by END,
          approved_at=CASE WHEN ?='APPROVED' THEN now() ELSE approved_at END,
          rejected_at=CASE WHEN ?='REJECTED' THEN now() ELSE rejected_at END,
          fulfilled_at=CASE WHEN ?='FULFILLED' THEN now() ELSE fulfilled_at END,
          closed_at=CASE WHEN ?='CLOSED' THEN now() ELSE closed_at END,
          updated_at=now()
      WHERE org_key=? AND id=?
      """,
      targetStatus.name(),
      targetStatus.name(), resolutionSummary,
      targetStatus.name(), jwt.getSubject(),
      targetStatus.name(), jwt.getSubject(),
      targetStatus.name(),
      targetStatus.name(),
      targetStatus.name(),
      targetStatus.name(),
      orgKey, id);

    appendComment(orgKey, id, jwt.getSubject(), targetStatus.name(), summarizeTransition(targetStatus, resolutionSummary), resolutionSummary);
    ServiceRequestRecord after = getRequest(orgKey, id);
    emitAudit(eventType, orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", eventType,
      "targetType", "service_request",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of("status", before.status(), "assigned_to", emptyToNull(before.assignedTo())),
      "after", Map.of("status", after.status(), "assigned_to", emptyToNull(after.assignedTo()), "resolution_summary", emptyToNull(after.resolutionSummary()))
    ));
    return toResponse(after);
  }

  private String summarizeTransition(ServiceRequestStatus targetStatus, String resolutionSummary) {
    return switch (targetStatus) {
      case APPROVED -> "Request approved";
      case REJECTED -> "Request rejected";
      case FULFILLED -> resolutionSummary.isBlank() ? "Request fulfilled" : resolutionSummary;
      case CLOSED -> "Request closed";
      default -> targetStatus.name();
    };
  }

  private Object emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
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
}
