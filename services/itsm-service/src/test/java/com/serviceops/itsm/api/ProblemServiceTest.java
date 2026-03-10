package com.serviceops.itsm.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.LinkedHashMap;
import java.util.List;
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

class ProblemServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private ProblemService service;
  private Jwt jwt;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new ProblemService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    jwt = Jwt.withTokenValue("token")
        .header("alg", "none")
        .claim("orgKey", "demo")
        .claim("role", "ANALYST")
        .subject("analyst-1")
        .build();
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-problem-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void executesLifecycleHappyPath() {
    when(jdbc.queryForObject(anyString(), eq(Long.class), eq("demo"), eq("Database connection pool saturation"), eq("CREATED"), eq("platform-sre"), eq("svc-db"), eq("Connection resets under load"), eq(""), eq("")))
        .thenReturn(77L);
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND id=?"), eq(Integer.class), eq("demo"), eq(42L)))
        .thenReturn(1);
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(problemRow(77L, "CREATED", "platform-sre", "", "")))
        .thenReturn(List.of())
        .thenReturn(List.of(problemRow(77L, "CREATED", "platform-sre", "", "")))
        .thenReturn(List.of())
        .thenReturn(List.of(problemRow(77L, "INCIDENT_LINKED", "platform-sre", "", "")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "INCIDENT_LINKED", "platform-sre", "", "")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "ROOT_CAUSE_IDENTIFIED", "platform-sre", "Connection pool exhausted", "")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "ROOT_CAUSE_IDENTIFIED", "platform-sre", "Connection pool exhausted", "")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "KNOWN_ERROR", "platform-sre", "Connection pool exhausted", "Default pool size too low")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "KNOWN_ERROR", "platform-sre", "Connection pool exhausted", "Default pool size too low")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "CLOSED", "platform-sre", "Connection pool exhausted", "Default pool size too low")))
        .thenReturn(List.of(linkedIncidentRow(42L)));
    when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

    Map<String, Object> created = service.create(jwt, Map.of(
        "title", "Database connection pool saturation",
        "service_key", "svc-db",
        "owner", "platform-sre",
        "summary", "Connection resets under load"), request);
    Map<String, Object> linked = service.linkIncident(77L, jwt, 42L, request);
    Map<String, Object> rootCause = service.identifyRootCause(77L, jwt, Map.of("rootCause", "Connection pool exhausted"), request);
    Map<String, Object> knownError = service.markKnownError(77L, jwt, Map.of("knownError", "Default pool size too low"), request);
    Map<String, Object> closed = service.close(77L, jwt, request);

    assertThat(created.get("status")).isEqualTo("CREATED");
    assertThat(linked.get("status")).isEqualTo("INCIDENT_LINKED");
    assertThat(rootCause.get("status")).isEqualTo("ROOT_CAUSE_IDENTIFIED");
    assertThat(knownError.get("status")).isEqualTo("KNOWN_ERROR");
    assertThat(closed.get("status")).isEqualTo("CLOSED");
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> linkedIncidents = (List<Map<String, Object>>) linked.get("linked_incidents");
    assertThat(linkedIncidents).hasSize(1);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void rejectsIllegalTransition() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(problemRow(77L, "CREATED", "platform-sre", "", "")))
        .thenReturn(List.of());

    assertThatThrownBy(() -> service.close(77L, jwt, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Illegal problem transition: CREATED -> CLOSED");

    verify(jdbc, never()).update(anyString(), any(Object[].class));
    verify(rest, never()).postForEntity(anyString(), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void rejectsLinkingUnknownIncident() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(problemRow(77L, "CREATED", "platform-sre", "", "")))
        .thenReturn(List.of());
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND id=?"), eq(Integer.class), eq("demo"), eq(404L)))
        .thenReturn(0);

    assertThatThrownBy(() -> service.linkIncident(77L, jwt, 404L, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Incident not found for problem linkage");
  }

  @Test
  void emitsStructuredAuditOnKnownError() {
    when(jdbc.queryForList(anyString(), any(Object[].class)))
        .thenReturn(List.of(problemRow(77L, "ROOT_CAUSE_IDENTIFIED", "platform-sre", "Connection pool exhausted", "")))
        .thenReturn(List.of(linkedIncidentRow(42L)))
        .thenReturn(List.of(problemRow(77L, "KNOWN_ERROR", "platform-sre", "Connection pool exhausted", "Default pool size too low")))
        .thenReturn(List.of(linkedIncidentRow(42L)));
    when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

    service.markKnownError(77L, jwt, Map.of("knownError", "Default pool size too low"), request);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));
    Map<String, Object> body = captor.getValue().getBody();
    assertThat(body).isNotNull();
    assertThat(body.get("eventType")).isEqualTo("problem.known_error_marked");
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) body.get("payload");
    assertThat(payload.get("targetType")).isEqualTo("problem");
    assertThat(payload.get("targetId")).isEqualTo(77L);
    assertThat(payload).containsKeys("before", "after", "timestamp");
  }

  @Test
  void rejectsReadonlyProblemMutation() {
    Jwt readonlyJwt = Jwt.withTokenValue("readonly-token")
        .header("alg", "none")
        .claim("orgKey", "demo")
        .claim("role", "READONLY")
        .subject("viewer-1")
        .build();

    assertThatThrownBy(() -> service.linkIncident(77L, readonlyJwt, 42L, request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Problem incident linkage requires ANALYST or ADMIN role");
  }

  private Map<String, Object> problemRow(Long id, String status, String owner, String rootCause, String knownError) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", id);
    row.put("org_key", "demo");
    row.put("title", "Database connection pool saturation");
    row.put("status", status);
    row.put("owner", owner);
    row.put("service_key", "svc-db");
    row.put("summary", "Connection resets under load");
    row.put("root_cause", rootCause);
    row.put("known_error", knownError);
    row.put("created_at", "2026-03-08T09:00:00Z");
    row.put("updated_at", "2026-03-08T10:00:00Z");
    return row;
  }

  private Map<String, Object> linkedIncidentRow(Long incidentId) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", incidentId);
    row.put("title", "Database saturation alert storm");
    return row;
  }
}
