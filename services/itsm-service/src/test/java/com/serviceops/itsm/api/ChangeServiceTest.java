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

class ChangeServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private ChangeService service;
  private Jwt jwt;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new ChangeService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    jwt = Jwt.withTokenValue("token").header("alg", "none").claim("orgKey", "demo").claim("role", "ANALYST").subject("analyst-1").build();
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-change-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void executesLifecycleHappyPath() {
    when(jdbc.queryForList(anyString(), eq("demo"), eq(88L)))
      .thenReturn(List.of(row(88L, "DRAFT", "ops", "", "")))
      .thenReturn(List.of(row(88L, "SUBMITTED", "ops", "", "")))
      .thenReturn(List.of(row(88L, "APPROVED", "ops", "admin-1", "")))
      .thenReturn(List.of(row(88L, "IMPLEMENTED", "ops", "admin-1", "")))
      .thenReturn(List.of(row(88L, "REVIEWED", "ops", "admin-1", "")));
    when(jdbc.update(anyString(), any(), any(), any(), any(), any())).thenReturn(1);

    Map<String, Object> submitted = service.submit(88L, jwt, request);
    Map<String, Object> implemented = service.implement(88L, jwt, request);
    Map<String, Object> reviewed = service.review(88L, jwt, request);

    assertThat(submitted.get("status")).isEqualTo("SUBMITTED");
    assertThat(implemented.get("status")).isEqualTo("IMPLEMENTED");
    assertThat(reviewed.get("status")).isEqualTo("REVIEWED");
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void rejectsIllegalTransition() {
    when(jdbc.queryForList(anyString(), eq("demo"), eq(88L)))
      .thenReturn(List.of(row(88L, "DRAFT", "ops", "", "")));

    assertThatThrownBy(() -> service.implement(88L, jwt, request))
      .isInstanceOf(ApiException.class)
      .hasMessage("Illegal change transition: DRAFT -> IMPLEMENTED");
    verify(jdbc, never()).update(anyString(), any(), any(), any(), any(), any());
  }

  @Test
  void emitsStructuredAuditOnSubmit() {
    when(jdbc.queryForList(anyString(), eq("demo"), eq(88L)))
      .thenReturn(List.of(row(88L, "DRAFT", "ops", "", "")))
      .thenReturn(List.of(row(88L, "SUBMITTED", "ops", "", "")));
    when(jdbc.update(anyString(), any(), any(), any(), any(), any())).thenReturn(1);

    service.submit(88L, jwt, request);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));
    Map<String, Object> body = captor.getValue().getBody();
    assertThat(body).isNotNull();
    assertThat(body.get("eventType")).isEqualTo("change.submitted");
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) body.get("payload");
    assertThat(payload.get("targetType")).isEqualTo("change");
    assertThat(payload.get("targetId")).isEqualTo(88L);
    assertThat(payload).containsKeys("before", "after", "timestamp");
  }

  @Test
  void rejectsReadonlyChangeMutation() {
    Jwt readonlyJwt = Jwt.withTokenValue("readonly-token").header("alg", "none").claim("orgKey", "demo").claim("role", "READONLY").subject("viewer-1").build();

    assertThatThrownBy(() -> service.submit(88L, readonlyJwt, request))
      .isInstanceOf(ApiException.class)
      .hasMessage("Change submission requires ANALYST or ADMIN role");

    verify(jdbc, never()).queryForList(anyString(), any(Object[].class));
  }

  private Map<String, Object> row(Long id, String status, String owner, String approvedBy, String rejectedBy) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", id);
    row.put("org_key", "demo");
    row.put("title", "Patch database parameter group");
    row.put("status", status);
    row.put("risk", "P2");
    row.put("service_key", "svc-db");
    row.put("ci_key", "ci-db-01");
    row.put("environment", "prod");
    row.put("owner", owner);
    row.put("requested_by", "analyst-1");
    row.put("approved_by", approvedBy);
    row.put("rejected_by", rejectedBy);
    row.put("plan", "1. apply change");
    row.put("rollback_plan", "1. revert change");
    row.put("preview_command", "kubectl rollout restart deploy/db");
    row.put("change_window_start", "2026-03-08T10:00:00Z");
    row.put("change_window_end", "2026-03-08T11:00:00Z");
    row.put("created_at", "2026-03-08T09:00:00Z");
    row.put("updated_at", "2026-03-08T09:05:00Z");
    row.put("approved_at", null);
    row.put("rejected_at", null);
    row.put("implemented_at", null);
    row.put("reviewed_at", null);
    return row;
  }
}
