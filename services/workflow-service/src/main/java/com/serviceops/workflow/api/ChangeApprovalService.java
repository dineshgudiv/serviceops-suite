package com.serviceops.workflow.api;

import java.time.OffsetDateTime;
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
public class ChangeApprovalService {
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public ChangeApprovalService(JdbcTemplate jdbc, RestTemplate rest) {
    this.jdbc = jdbc;
    this.rest = rest;
  }

  public Map<String, Object> approve(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    requireAdmin(jwt);
    return decide(id, jwt, req, "APPROVED", "change.approved");
  }

  public Map<String, Object> reject(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    requireAdmin(jwt);
    return decide(id, jwt, req, "REJECTED", "change.rejected");
  }

  private Map<String, Object> decide(Long id, Jwt jwt, jakarta.servlet.http.HttpServletRequest req, String targetStatus, String eventType) {
    String orgKey = jwt.getClaimAsString("orgKey");
    Map<String, Object> before = jdbc.queryForMap("SELECT id,status,risk,owner,service_key,ci_key FROM itsm.changes WHERE org_key=? AND id=?", orgKey, id);
    String currentStatus = Objects.toString(before.get("status"), "");
    if (!"SUBMITTED".equals(currentStatus)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CHANGE_INVALID_TRANSITION", "Illegal change transition: " + currentStatus + " -> " + targetStatus);
    }
    int changed = jdbc.update("""
      UPDATE itsm.changes
      SET status=?, approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE approved_by END,
          rejected_by=CASE WHEN ?='REJECTED' THEN ? ELSE rejected_by END,
          approved_at=CASE WHEN ?='APPROVED' THEN now() ELSE approved_at END,
          rejected_at=CASE WHEN ?='REJECTED' THEN now() ELSE rejected_at END,
          updated_at=now()
      WHERE org_key=? AND id=?
      """, targetStatus, targetStatus, jwt.getSubject(), targetStatus, jwt.getSubject(), targetStatus, targetStatus, orgKey, id);
    if (changed == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, "CHANGE_NOT_FOUND", "Change not found");
    }
    Map<String, Object> after = jdbc.queryForMap("SELECT id,status,risk,owner,service_key,ci_key FROM itsm.changes WHERE org_key=? AND id=?", orgKey, id);
    emitAudit(eventType, orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", eventType,
      "targetType", "change",
      "targetId", id,
      "timestamp", OffsetDateTime.now().toString(),
      "before", before,
      "after", after
    ));
    return Map.of("id", id, "status", targetStatus);
  }

  private void requireAdmin(Jwt jwt) {
    String role = jwt.getClaimAsString("role");
    if (!"ADMIN".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", "Admin role is required for change approval decisions");
    }
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
      throw new ApiException(HttpStatus.BAD_GATEWAY, "AUDIT_DOWNSTREAM", "Audit downstream call failed");
    }
  }
}
