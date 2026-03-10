package com.serviceops.itsm.api;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SituationCorrelationEngineTest {
  private final SituationCorrelationEngine engine = new SituationCorrelationEngine();

  @Test
  void correlatesNearbyServiceWithRecentChange() {
    Map<String, Object> situation = Map.of(
      "service_key", "svc-payments",
      "environment", "prod",
      "severity", "P2",
      "updated_at", Instant.now().toString(),
      "summary", "database timeout"
    );
    Map<String, Object> alert = Map.of(
      "service_key", "svc-db",
      "environment", "prod",
      "severity", "P1",
      "last_seen_at", Instant.now().toString(),
      "title", "Database timeout spike"
    );

    assertTrue(engine.belongsToSituation(situation, alert, List.of("svc-db"), List.of(Map.of("id", 1L))));
  }

  @Test
  void rejectsCrossEnvironmentAlert() {
    Map<String, Object> situation = Map.of(
      "service_key", "svc-payments",
      "environment", "prod",
      "severity", "P2",
      "updated_at", Instant.now().toString(),
      "summary", "database timeout"
    );
    Map<String, Object> alert = Map.of(
      "service_key", "svc-payments",
      "environment", "stage",
      "severity", "P2",
      "last_seen_at", Instant.now().toString(),
      "title", "Database timeout spike"
    );

    assertFalse(engine.belongsToSituation(situation, alert, List.of(), List.of()));
  }
}
