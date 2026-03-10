package com.serviceops.itsm.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

class IncidentServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private IncidentService service;
  private Jwt jwt;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new IncidentService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    jwt = Jwt.withTokenValue("test-token")
        .header("alg", "none")
        .claim("orgKey", "demo")
        .claim("role", "ANALYST")
        .subject("user-123")
        .build();
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-123");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void executesLifecycleHappyPath() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(row(42L, "NEW", "", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "ASSIGNED", "oncall-db", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "ASSIGNED", "oncall-db", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "INVESTIGATING", "oncall-db", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "INVESTIGATING", "oncall-db", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "RESOLVED", "oncall-db", "Mitigated by restarting read replica", "2026-03-08T10:15:00Z")))
        .thenReturn(List.of(row(42L, "RESOLVED", "oncall-db", "Mitigated by restarting read replica", "2026-03-08T10:15:00Z")))
        .thenReturn(List.of(row(42L, "CLOSED", "oncall-db", "Mitigated by restarting read replica", "2026-03-08T10:15:00Z")));
    when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

    Map<String, Object> assigned = service.assign(42L, Map.of("assignee", "oncall-db"), jwt, request);
    Map<String, Object> investigating = service.investigate(42L, jwt, request);
    Map<String, Object> resolved = service.resolve(42L, Map.of("resolution_notes", "Mitigated by restarting read replica"), jwt, request);
    Map<String, Object> closed = service.close(42L, jwt, request);

    assertThat(assigned.get("status")).isEqualTo("ASSIGNED");
    assertThat(investigating.get("status")).isEqualTo("INVESTIGATING");
    assertThat(resolved.get("status")).isEqualTo("RESOLVED");
    assertThat(closed.get("status")).isEqualTo("CLOSED");
    verify(jdbc, times(4)).update(anyString(), any(Object[].class));
    verify(rest, times(4)).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void rejectsIllegalTransition() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(row(42L, "NEW", "", "Investigate DB saturation", null)));

    assertThatThrownBy(() -> service.resolve(42L, Map.of("resolution_notes", "too early"), jwt, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Illegal incident transition: NEW -> RESOLVED");

    verify(jdbc, never()).update(anyString(), any(Object[].class));
    verify(rest, never()).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void emitsStructuredAuditPayloadOnAssign() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(row(42L, "NEW", "", "Investigate DB saturation", null)))
        .thenReturn(List.of(row(42L, "ASSIGNED", "oncall-db", "Investigate DB saturation", null)));
    when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

    service.assign(42L, Map.of("assignee", "oncall-db"), jwt, request);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));

    Map<String, Object> body = captor.getValue().getBody();
    assertThat(body).isNotNull();
    assertThat(body.get("orgKey")).isEqualTo("demo");
    assertThat(body.get("eventType")).isEqualTo("incident.assigned");
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) body.get("payload");
    assertThat(payload.get("actor")).isEqualTo("user-123");
    assertThat(payload.get("targetType")).isEqualTo("incident");
    assertThat(payload.get("targetId")).isEqualTo(42L);
    assertThat(payload).containsKeys("before", "after", "timestamp");
  }

  @Test
  void rejectsReadonlyIncidentMutation() {
    Jwt readonlyJwt = Jwt.withTokenValue("readonly-token")
        .header("alg", "none")
        .claim("orgKey", "demo")
        .claim("role", "READONLY")
        .subject("viewer-1")
        .build();

    assertThatThrownBy(() -> service.assign(42L, Map.of("assignee", "oncall-db"), readonlyJwt, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Incident assignment requires ANALYST or ADMIN role");

    verify(jdbc, never()).queryForList(anyString(), any(Object[].class));
    verify(rest, never()).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
  }

  private Map<String, Object> row(Long id, String status, String assignedTo, String description, String resolvedAt) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", id);
    row.put("org_key", "demo");
    row.put("title", "Database saturation");
    row.put("description", description);
    row.put("severity", "P1");
    row.put("status", status);
    row.put("created_by", "user-123");
    row.put("assigned_to", assignedTo);
    row.put("service_key", "svc-db");
    row.put("ci_key", "ci-db-01");
    row.put("environment", "prod");
    row.put("created_at", "2026-03-08T10:00:00Z");
    row.put("updated_at", "2026-03-08T10:05:00Z");
    row.put("resolved_at", resolvedAt);
    return row;
  }
}
