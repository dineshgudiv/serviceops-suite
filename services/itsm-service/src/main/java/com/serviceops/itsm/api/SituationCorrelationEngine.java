package com.serviceops.itsm.api;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class SituationCorrelationEngine {
  private static final Duration CORRELATION_WINDOW = Duration.ofMinutes(45);

  public String fingerprint(String title, String serviceKey, String ciKey, String environment, String severity) {
    return sha256((serviceKey + "|" + ciKey + "|" + environment + "|" + severity + "|" + normalize(title)).toLowerCase(Locale.ROOT));
  }

  public boolean belongsToSituation(Map<String, Object> existingSituation, Map<String, Object> alert, List<String> topologyNeighbors, List<Map<String, Object>> recentChanges) {
    String situationService = stringValue(existingSituation.get("service_key"));
    String alertService = stringValue(alert.get("service_key"));
    String situationEnv = stringValue(existingSituation.get("environment"));
    String alertEnv = stringValue(alert.get("environment"));
    String situationSeverity = stringValue(existingSituation.get("severity"));
    String alertSeverity = stringValue(alert.get("severity"));

    if (!situationEnv.equalsIgnoreCase(alertEnv)) {
      return false;
    }
    if (!(situationService.equals(alertService) || topologyNeighbors.contains(alertService))) {
      return false;
    }
    if (!sameSeverityBand(situationSeverity, alertSeverity)) {
      return false;
    }

    Instant updatedAt = Instant.parse(String.valueOf(existingSituation.get("updated_at")));
    Instant lastSeen = Instant.parse(String.valueOf(alert.get("last_seen_at")));
    if (Duration.between(updatedAt, lastSeen).abs().compareTo(CORRELATION_WINDOW) > 0) {
      return false;
    }

    if (!recentChanges.isEmpty()) {
      return true;
    }
    String summary = stringValue(existingSituation.get("summary"));
    String title = stringValue(alert.get("title"));
    return summary.contains(normalize(title)) || normalize(title).contains(summary);
  }

  public String summarizeAlert(Map<String, Object> alert) {
    return normalize(stringValue(alert.get("title")));
  }

  private boolean sameSeverityBand(String a, String b) {
    return rank(a) == rank(b) || Math.abs(rank(a) - rank(b)) <= 1;
  }

  private int rank(String severity) {
    return switch (severity.toUpperCase(Locale.ROOT)) {
      case "P1", "CRITICAL" -> 1;
      case "P2", "HIGH" -> 2;
      case "P3", "MEDIUM" -> 3;
      default -> 4;
    };
  }

  private String normalize(String input) {
    return input == null ? "" : input.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
  }

  private String stringValue(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private String sha256(String raw) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes()));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
  }
}
