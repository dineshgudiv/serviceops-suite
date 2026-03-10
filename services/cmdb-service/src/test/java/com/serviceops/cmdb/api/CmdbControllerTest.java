package com.serviceops.cmdb.api;

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

class CmdbControllerTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private TopologyService topologyService;

  @Mock
  private RestTemplate rest;

  private CmdbController controller;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    controller = new CmdbController(jdbc, topologyService, rest);
    ReflectionTestUtils.setField(controller, "auditBaseUrl", "http://audit-service:8088");
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-cmdb-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void rejectsReadonlyCiCreate() {
    assertThatThrownBy(() -> controller.create(Map.of("name", "db01"), readonlyJwt(), request))
        .isInstanceOf(ApiException.class)
        .hasMessage("CMDB CI creation requires ANALYST or ADMIN role");

    verify(jdbc, never()).update(anyString(), any(), any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void emitsAuditForRelationshipCreate() {
    Map<String, Object> result = controller.rel(Map.of(
        "from_ci_key", "ci-app",
        "to_ci_key", "ci-db",
        "rel_type", "depends_on",
        "source", "manual",
        "confidence", "1.0"), analystJwt(), request);

    assertThat(result.get("status")).isEqualTo("ok");
    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));
    assertThat(captor.getValue().getBody().get("eventType")).isEqualTo("cmdb.relationship_created");
  }

  private Jwt analystJwt() {
    return Jwt.withTokenValue("analyst-token").header("alg", "none").claim("orgKey", "demo").claim("role", "ANALYST").subject("analyst-1").build();
  }

  private Jwt readonlyJwt() {
    return Jwt.withTokenValue("readonly-token").header("alg", "none").claim("orgKey", "demo").claim("role", "READONLY").subject("viewer-1").build();
  }
}
