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
public class IncidentService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public IncidentService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public Map<String, Object> create(Map<String, String> body, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireRequesterOrOperator(jwt, "Incident creation");
    String orgKey = jwt.getClaimAsString("orgKey");
    String title = body.getOrDefault("title", "").trim();
    if (title.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_TITLE_REQUIRED", "Incident title is required");
    }
    String description = body.getOrDefault("description", "").trim();
    if (description.length() < 12) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_DESCRIPTION_REQUIRED", "Incident description must be at least 12 characters");
    }
    String impact = normalizeIncidentScale(body.getOrDefault("impact", "MEDIUM"), "INCIDENT_IMPACT_INVALID", "Impact must be LOW, MEDIUM, or HIGH");
    String urgency = normalizeIncidentScale(body.getOrDefault("urgency", "MEDIUM"), "INCIDENT_URGENCY_INVALID", "Urgency must be LOW, MEDIUM, or HIGH");
    String category = normalizeCategory(body.getOrDefault("category", "GENERAL"));
    String severity = deriveSeverity(impact, urgency);
    String requester = body.getOrDefault("requester", "").trim();
    if (requester.isBlank()) {
      requester = jwt.getSubject();
    }
    if (requester.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_REQUESTER_REQUIRED", "Requester is required");
    }
    Long id = jdbc.queryForObject(
        """
        INSERT INTO itsm.incidents(org_key,title,description,severity,impact,urgency,category,status,created_by,requester,assigned_to,service_key,ci_key,environment,attachment_name,updated_at,resolved_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),NULL)
        RETURNING id
        """,
        Long.class,
        orgKey,
        title,
        description,
        severity,
        impact,
        urgency,
        category,
        IncidentStatus.NEW.name(),
        jwt.getSubject(),
        requester,
        null,
        body.getOrDefault("service_key", ""),
        body.getOrDefault("ci_key", ""),
        body.getOrDefault("environment", "prod"),
        emptyToNull(body.get("attachment_name")));
    IncidentRecord incident = getIncident(orgKey, id);
    emitAudit("incident.created", orgKey, req, Map.of(
        "actor", jwt.getSubject(),
        "action", "create",
        "targetType", "incident",
        "targetId", id,
        "timestamp", OffsetDateTime.now().toString(),
        "before", Map.of(),
        "after", toAuditState(incident)));
    return toResponse(incident);
  }

  public List<Map<String, Object>> list(Jwt jwt, String q, int page, int size) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Incident queue access");
    return jdbc.queryForList(
        """
        SELECT id,org_key,title,description,severity,status,created_by,assigned_to,created_at,updated_at,resolved_at,service_key,ci_key,environment
               ,impact,urgency,category,requester,attachment_name
        FROM itsm.incidents
        WHERE org_key=? AND (COALESCE(?, '')='' OR LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """,
        jwt.getClaimAsString("orgKey"), q, "%" + q + "%", "%" + q + "%", size, page * size)
        .stream()
        .map(this::mapIncident)
        .map(this::toResponse)
        .toList();
  }

  public Map<String, Object> assign(Long id, Map<String, String> body, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Incident assignment");
    String assignee = body.getOrDefault("assignee", "").trim();
    if (assignee.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_ASSIGNEE_REQUIRED", "Assignee is required");
    }
    return transition(id, jwt, req, IncidentStatus.ASSIGNED, "incident.assigned", Map.of("assigned_to", assignee));
  }

  public Map<String, Object> investigate(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Incident investigation");
    return transition(id, jwt, req, IncidentStatus.INVESTIGATING, "incident.investigating", Map.of());
  }

  public Map<String, Object> resolve(Long id, Map<String, String> body, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Incident resolution");
    return transition(id, jwt, req, IncidentStatus.RESOLVED, "incident.resolved", Map.of(
        "resolution_notes", body.getOrDefault("resolution_notes", body.getOrDefault("description", ""))));
  }

  public Map<String, Object> close(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Incident closure");
    return transition(id, jwt, req, IncidentStatus.CLOSED, "incident.closed", Map.of());
  }

  private Map<String, Object> transition(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req, IncidentStatus targetStatus, String eventType, Map<String, Object> attributes) {
    String orgKey = jwt.getClaimAsString("orgKey");
    IncidentRecord before = getIncident(orgKey, id);
    if (!before.status().canTransitionTo(targetStatus)) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INCIDENT_INVALID_TRANSITION",
          "Illegal incident transition: " + before.status().name() + " -> " + targetStatus.name());
    }

    String assignedTo = attributes.containsKey("assigned_to") ? Objects.toString(attributes.get("assigned_to"), null) : before.assignedTo();
    String description = before.description();
    Object resolutionNotes = attributes.get("resolution_notes");
    if (resolutionNotes != null && !Objects.toString(resolutionNotes, "").isBlank()) {
      description = Objects.toString(resolutionNotes, "");
    }

    int changed = jdbc.update(
        """
        UPDATE itsm.incidents
        SET status=?, assigned_to=?, description=?, resolved_at=CASE WHEN ?='RESOLVED' THEN now() WHEN ?='CLOSED' THEN COALESCE(resolved_at, now()) ELSE NULL END, updated_at=now()
        WHERE org_key=? AND id=?
        """,
        targetStatus.name(), assignedTo, description, targetStatus.name(), targetStatus.name(), orgKey, id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "INCIDENT_NOT_FOUND", "Incident not found");
    }

    IncidentRecord after = getIncident(orgKey, id);
    emitAudit(eventType, orgKey, req, Map.of(
        "actor", jwt.getSubject(),
        "action", eventType,
        "targetType", "incident",
        "targetId", id,
        "timestamp", OffsetDateTime.now().toString(),
        "before", toAuditState(before),
        "after", toAuditState(after)));
    return toResponse(after);
  }

  private IncidentRecord getIncident(String orgKey, Long id) {
    List<Map<String, Object>> rows = jdbc.queryForList(
        """
        SELECT id,org_key,title,description,severity,impact,urgency,category,status,created_by,requester,assigned_to,service_key,ci_key,environment,attachment_name,created_at,updated_at,resolved_at
        FROM itsm.incidents
        WHERE org_key=? AND id=?
        """,
        orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "INCIDENT_NOT_FOUND", "Incident not found");
    }
    return mapIncident(rows.getFirst());
  }

  private IncidentRecord mapIncident(Map<String, Object> row) {
    return new IncidentRecord(
        ((Number) row.get("id")).longValue(),
        Objects.toString(row.get("org_key"), ""),
        Objects.toString(row.get("title"), ""),
        Objects.toString(row.get("description"), ""),
        Objects.toString(row.get("severity"), "P3"),
        Objects.toString(row.get("impact"), "MEDIUM"),
        Objects.toString(row.get("urgency"), "MEDIUM"),
        Objects.toString(row.get("category"), "GENERAL"),
        IncidentStatus.fromDb(Objects.toString(row.get("status"), IncidentStatus.NEW.name())),
        Objects.toString(row.get("created_by"), ""),
        Objects.toString(row.get("requester"), ""),
        Objects.toString(row.get("assigned_to"), ""),
        Objects.toString(row.get("service_key"), ""),
        Objects.toString(row.get("ci_key"), ""),
        Objects.toString(row.get("environment"), "prod"),
        Objects.toString(row.get("attachment_name"), ""),
        row.get("created_at"),
        row.get("updated_at"),
        row.get("resolved_at"));
  }

  private Map<String, Object> toResponse(IncidentRecord incident) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", incident.id());
    out.put("title", incident.title());
    out.put("description", incident.description());
    out.put("priority", incident.severity());
    out.put("severity", incident.severity());
    out.put("impact", incident.impact());
    out.put("urgency", incident.urgency());
    out.put("category", incident.category());
    out.put("status", incident.status().name());
    out.put("service", incident.serviceKey());
    out.put("service_key", incident.serviceKey());
    out.put("ci_key", incident.ciKey());
    out.put("environment", incident.environment());
    out.put("created_at", incident.createdAt());
    out.put("updated_at", incident.updatedAt());
    out.put("resolved_at", incident.resolvedAt());
    out.put("assignee", incident.assignedTo() == null || incident.assignedTo().isBlank() ? null : incident.assignedTo());
    out.put("created_by", incident.createdBy());
    out.put("requester", incident.requester() == null || incident.requester().isBlank() ? null : incident.requester());
    out.put("attachment_name", incident.attachmentName() == null || incident.attachmentName().isBlank() ? null : incident.attachmentName());
    return out;
  }

  private Map<String, Object> toAuditState(IncidentRecord incident) {
    return Map.of(
        "id", incident.id(),
        "status", incident.status().name(),
        "severity", incident.severity(),
        "impact", incident.impact(),
        "urgency", incident.urgency(),
        "category", incident.category(),
        "assigned_to", incident.assignedTo() == null ? "" : incident.assignedTo(),
        "description", incident.description() == null ? "" : incident.description(),
        "service_key", incident.serviceKey() == null ? "" : incident.serviceKey(),
        "ci_key", incident.ciKey() == null ? "" : incident.ciKey());
  }

  private String normalizeIncidentScale(String value, String code, String message) {
    String normalized = Objects.toString(value, "").trim().toUpperCase();
    if (!List.of("LOW", "MEDIUM", "HIGH").contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }
    return normalized;
  }

  private String normalizeCategory(String value) {
    String normalized = Objects.toString(value, "").trim().toUpperCase();
    if (normalized.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "INCIDENT_CATEGORY_REQUIRED", "Category is required");
    }
    return normalized.replace(' ', '_');
  }

  private String deriveSeverity(String impact, String urgency) {
    if ("HIGH".equals(impact) && "HIGH".equals(urgency)) return "P1";
    if ("HIGH".equals(impact) || "HIGH".equals(urgency)) return "P2";
    if ("MEDIUM".equals(impact) && "MEDIUM".equals(urgency)) return "P3";
    return "P4";
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
