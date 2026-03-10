package com.serviceops.itsm.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

class ServiceRequestServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private ServiceRequestService service;
  private Jwt jwt;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new ServiceRequestService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    jwt = Jwt.withTokenValue("token").header("alg", "none").claim("orgKey", "demo").claim("role", "ANALYST").subject("analyst-1").build();
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-sr-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void createsServiceRequestAndAudits() {
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.catalog_services WHERE org_key=? AND service_key=?"), eq(Integer.class), eq("demo"), eq("svc-db")))
      .thenReturn(1);
    when(jdbc.queryForObject(anyString(), eq(Long.class), eq("demo"), eq("svc-db"), eq("Need database backup access"), eq("Need access to restore prod backups"), eq("analyst-1"), eq("analyst-1"), eq("cab-demo"), eq("SUBMITTED"), eq(null)))
      .thenReturn(41L);
    when(jdbc.queryForList(anyString(), eq("demo"), eq(41L)))
      .thenReturn(List.of(serviceRequestRow()));

    Map<String, Object> created = service.create(jwt, Map.of(
      "service_key", "svc-db",
      "short_description", "Need database backup access",
      "justification", "Need access to restore prod backups",
      "requester", "analyst-1",
      "approval_target", "cab-demo"
    ), request);

    assertThat(created.get("id")).isEqualTo(41L);
    assertThat(created.get("status")).isEqualTo("SUBMITTED");
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), any(HttpEntity.class), eq(Map.class));
  }

  @Test
  void rejectsUnknownService() {
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.catalog_services WHERE org_key=? AND service_key=?"), eq(Integer.class), eq("demo"), eq("svc-missing")))
      .thenReturn(0);

    assertThatThrownBy(() -> service.create(jwt, Map.of(
      "service_key", "svc-missing",
      "short_description", "Need access to missing service",
      "justification", "Trying to route to a service that does not exist"
    ), request))
      .isInstanceOf(ApiException.class)
      .hasMessage("Selected catalog service was not found");
  }

  private Map<String, Object> serviceRequestRow() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", 41L);
    row.put("org_key", "demo");
    row.put("service_key", "svc-db");
    row.put("short_description", "Need database backup access");
    row.put("justification", "Need access to restore prod backups");
    row.put("created_by_user_id", "analyst-1");
    row.put("requester", "analyst-1");
    row.put("approval_target", "cab-demo");
    row.put("status", "SUBMITTED");
    row.put("assigned_to", "");
    row.put("attachment_name", "");
    row.put("resolution_summary", "");
    row.put("approved_by", "");
    row.put("rejected_by", "");
    row.put("created_at", "2026-03-08T12:00:00Z");
    row.put("updated_at", "2026-03-08T12:00:00Z");
    row.put("approved_at", null);
    row.put("rejected_at", null);
    row.put("fulfilled_at", null);
    row.put("closed_at", null);
    return row;
  }
}
