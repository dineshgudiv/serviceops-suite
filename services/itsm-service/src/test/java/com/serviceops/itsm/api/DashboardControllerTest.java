package com.serviceops.itsm.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;

class DashboardControllerTest {
  @Mock
  private JdbcTemplate jdbc;

  private DashboardController controller;
  private Jwt jwt;

  @BeforeEach
  void setUp() {
    MockitoAnnotations.openMocks(this);
    controller = new DashboardController(jdbc);
    jwt = Jwt.withTokenValue("dash-token")
        .header("alg", "none")
        .claim("orgKey", "demo")
        .subject("admin@demo.local")
        .build();
  }

  @Test
  void returnsCrossDomainDashboardSummary() {
    when(jdbc.queryForObject(eq("SELECT count(*) FROM itsm.incidents WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED')"), eq(Integer.class), eq("demo")))
        .thenReturn(1);
    when(jdbc.queryForObject(anyString(), eq(Integer.class), eq("demo")))
        .thenReturn(1)
        .thenReturn(1)
        .thenReturn(1)
        .thenReturn(1)
        .thenReturn(2)
        .thenReturn(4)
        .thenReturn(1)
        .thenReturn(75);

    when(jdbc.queryForList(eq("SELECT severity, count(*) as cnt FROM itsm.incidents WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED') GROUP BY severity"), eq("demo")))
        .thenReturn(List.of(Map.of("severity", "P2", "cnt", 1)));
    when(jdbc.queryForList(eq("SELECT status, count(*) AS cnt FROM itsm.problems WHERE org_key=? GROUP BY status"), eq("demo")))
        .thenReturn(List.of(Map.of("status", "KNOWN_ERROR", "cnt", 1)));
    when(jdbc.queryForList(eq("SELECT status, count(*) AS cnt FROM itsm.changes WHERE org_key=? GROUP BY status"), eq("demo")))
        .thenReturn(List.of(Map.of("status", "REVIEWED", "cnt", 1)));
    when(jdbc.queryForList(anyString(), eq("demo")))
        .thenReturn(List.of(Map.of("service_key", "svc-ordering", "cnt", 2)))
        .thenReturn(List.of(Map.of("dow", "Sun", "cnt", 1)))
        .thenReturn(List.of(Map.of("id", 12L, "title", "Read replica lag", "severity", "P2", "status", "INVESTIGATING", "service_key", "svc-ordering", "ci_key", "ci-orders-db-primary", "created_at", "2026-03-08T08:00:00Z")));

    Map<String, Object> out = controller.summary(jwt);

    assertThat(out.get("open_incidents_count")).isEqualTo(1);
    assertThat(out.get("mttr_minutes")).isEqualTo(75);
    assertThat(out.get("current_sla_breaches_count")).isEqualTo(1);
    assertThat(out.get("knowledge_documents_count")).isEqualTo(1);
    assertThat(out.get("cmdb_ci_count")).isEqualTo(2);
    assertThat(out.get("audit_activity_24h_count")).isEqualTo(4);
    assertThat(out.get("tickets_by_service")).isEqualTo(List.of(Map.of("service", "svc-ordering", "count", 2)));
    assertThat(((Map<?, ?>) out.get("problems_by_status")).get("KNOWN_ERROR")).isEqualTo(1);
    assertThat(((Map<?, ?>) out.get("changes_by_status")).get("REVIEWED")).isEqualTo(1);
  }
}
