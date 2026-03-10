package com.serviceops.knowledge.api;

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

class KnowledgeControllerTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private GovernedRetrievalService retrievalService;

  @Mock
  private RestTemplate rest;

  private KnowledgeController controller;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    controller = new KnowledgeController(jdbc, retrievalService, rest);
    ReflectionTestUtils.setField(controller, "auditBaseUrl", "http://audit-service:8088");
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-knowledge-1");
    when(retrievalService.sanitize(anyString())).thenAnswer(invocation -> invocation.getArgument(0));
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("id", 1L)));
  }

  @Test
  void rejectsReadonlyDocumentWrite() {
    assertThatThrownBy(() -> controller.upload(Map.of("title", "Runbook", "content", "body", "approval_status", "draft"), readonlyJwt(), request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Knowledge document write requires ANALYST or ADMIN role");

    verify(jdbc, never()).queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void rejectsAnalystPublish() {
    assertThatThrownBy(() -> controller.upload(Map.of("title", "Runbook", "content", "body", "approval_status", "approved"), analystJwt(), request))
        .isInstanceOf(ApiException.class)
        .hasMessage("Knowledge publish requires ADMIN role");
  }

  @Test
  void emitsAuditForApprovedDocument() {
    when(jdbc.queryForObject(anyString(), eq(Long.class), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .thenReturn(19L);

    Map<String, Object> result = controller.upload(Map.of(
        "title", "DB recovery",
        "content", "restart replica",
        "approval_status", "approved",
        "visibility", "viewer"), adminJwt(), request);

    assertThat(result.get("status")).isEqualTo("indexed");
    @SuppressWarnings("unchecked")
    ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass((Class) HttpEntity.class);
    verify(rest).postForEntity(eq("http://audit-service:8088/api/audit/events"), captor.capture(), eq(Map.class));
    assertThat(captor.getValue().getBody().get("eventType")).isEqualTo("knowledge.document_published");
  }

  private Jwt adminJwt() {
    return Jwt.withTokenValue("admin-token").header("alg", "none").claim("orgKey", "demo").claim("role", "ADMIN").subject("admin-1").build();
  }

  private Jwt analystJwt() {
    return Jwt.withTokenValue("analyst-token").header("alg", "none").claim("orgKey", "demo").claim("role", "ANALYST").subject("analyst-1").build();
  }

  private Jwt readonlyJwt() {
    return Jwt.withTokenValue("readonly-token").header("alg", "none").claim("orgKey", "demo").claim("role", "READONLY").subject("viewer-1").build();
  }
}
