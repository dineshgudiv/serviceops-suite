package com.serviceops.workflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

class ChangeApprovalServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private ChangeApprovalService service;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new ChangeApprovalService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-approve-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void approvesSubmittedChangeAsAdmin() {
    when(jdbc.queryForMap(anyString(), eq("demo"), eq(55L)))
      .thenReturn(Map.of("id", 55L, "status", "SUBMITTED", "risk", "P2", "owner", "ops", "service_key", "svc-app", "ci_key", "ci-app"))
      .thenReturn(Map.of("id", 55L, "status", "APPROVED", "risk", "P2", "owner", "ops", "service_key", "svc-app", "ci_key", "ci-app"));
    when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(1);

    Map<String, Object> result = service.approve(55L, adminJwt(), request);

    assertThat(result.get("status")).isEqualTo("APPROVED");
    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));
    assertThat(captor.getValue().getBody().get("eventType")).isEqualTo("change.approved");
  }

  @Test
  void rejectsUnauthorizedApprover() {
    assertThatThrownBy(() -> service.approve(55L, analystJwt(), request))
      .isInstanceOf(ApiException.class)
      .hasMessage("Admin role is required for change approval decisions");
    verify(jdbc, never()).queryForMap(anyString(), any(), any());
  }

  @Test
  void rejectsInvalidTransition() {
    when(jdbc.queryForMap(anyString(), eq("demo"), eq(55L)))
      .thenReturn(Map.of("id", 55L, "status", "DRAFT", "risk", "P2", "owner", "ops", "service_key", "svc-app", "ci_key", "ci-app"));

    assertThatThrownBy(() -> service.reject(55L, adminJwt(), request))
      .isInstanceOf(ApiException.class)
      .hasMessage("Illegal change transition: DRAFT -> REJECTED");
    verify(jdbc, never()).update(anyString(), any(), any(), any(), any(), any(), any(), any(), any());
  }

  private Jwt adminJwt() {
    return Jwt.withTokenValue("admin-token").header("alg", "none").claim("orgKey", "demo").claim("role", "ADMIN").subject("admin-1").build();
  }

  private Jwt analystJwt() {
    return Jwt.withTokenValue("analyst-token").header("alg", "none").claim("orgKey", "demo").claim("role", "ANALYST").subject("analyst-1").build();
  }
}
