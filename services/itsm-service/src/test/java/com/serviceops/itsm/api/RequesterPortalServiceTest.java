package com.serviceops.itsm.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
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

class RequesterPortalServiceTest {
  @Mock
  private JdbcTemplate jdbc;

  @Mock
  private RestTemplate rest;

  private RequesterPortalService service;
  private Jwt requesterJwt;
  private MockHttpServletRequest request;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    service = new RequesterPortalService(jdbc, rest);
    ReflectionTestUtils.setField(service, "auditBaseUrl", "http://audit-service:8088");
    requesterJwt = Jwt.withTokenValue("requester-token")
      .header("alg", "none")
      .claim("orgKey", "demo")
      .claim("role", "REQUESTER")
      .subject("requester-1")
      .build();
    request = new MockHttpServletRequest();
    request.setAttribute("request_id", "req-portal-1");
    when(rest.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of("ok", true)));
  }

  @Test
  void listsOnlyOwnedRequests() {
    when(jdbc.queryForList(anyString(), eq("demo"), eq("requester-1"), eq("%%"), eq("%%"), eq("%%")))
      .thenReturn(List.of(Map.of(
        "id", 11L,
        "title", "Laptop setup blocked",
        "status", "NEW",
        "severity", "P2",
        "updated_at", "2026-03-08T12:20:00Z",
        "created_at", "2026-03-08T12:10:00Z",
        "item_type", "INCIDENT"
      )))
      .thenReturn(List.of());

    List<Map<String, Object>> items = service.listMyRequests(requesterJwt, "");

    assertThat(items).hasSize(1);
    assertThat(items.getFirst()).containsEntry("id", "INC-11");
    assertThat(items.getFirst()).containsEntry("title", "Laptop setup blocked");
  }

  @Test
  void rejectsCommentForUnownedRequest() {
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND id=? AND created_by=?"), eq(Integer.class), eq("demo"), eq(44L), eq("requester-1")))
      .thenReturn(0);

    assertThatThrownBy(() -> service.addComment(requesterJwt, "incident", 44L, Map.of("summary", "Need update"), request))
      .isInstanceOf(ApiException.class)
      .hasMessage("You do not have access to this request");

    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }
}
