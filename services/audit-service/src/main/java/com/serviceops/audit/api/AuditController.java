package com.serviceops.audit.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.serviceops.audit.model.AuditEvent;
import com.serviceops.audit.repo.AuditEventRepository;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuditController {
  private final AuditEventRepository repo;
  @Value("${app.hmacSecret}") private String secret;

  public AuditController(AuditEventRepository repo) { this.repo = repo; }

  @PostMapping("/api/audit/events")
  public Map<String, Object> append(@RequestBody Map<String, Object> body) {
    String orgKey = String.valueOf(body.get("orgKey"));
    String eventType = String.valueOf(body.get("eventType"));
    JsonNode payload = new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(body.get("payload"));
    List<AuditEvent> existing = repo.findByOrgKeyOrderByIdAsc(orgKey);
    String prevHash = existing.isEmpty() ? "GENESIS" : existing.get(existing.size() - 1).getEventHash();
    String hash = hmac(prevHash + "|" + orgKey + "|" + eventType + "|" + payload.toString());
    AuditEvent e = new AuditEvent();
    e.setOrgKey(orgKey); e.setEventType(eventType); e.setPayload(payload); e.setPrevHash(prevHash); e.setEventHash(hash); e.setCreatedAt(OffsetDateTime.now());
    repo.save(e);
    return Map.of("id", e.getId(), "hash", hash);
  }

  @GetMapping("/api/audit/verify")
  public Map<String, Object> verify(@RequestParam String orgKey) {
    List<AuditEvent> events = repo.findByOrgKeyOrderByIdAsc(orgKey);
    boolean ok = verifyChain(events);
    return Map.of("ok", ok, "events", events.size());
  }

  @GetMapping("/api/audit/events")
  public List<Map<String, Object>> list(@RequestParam String orgKey) {
    return repo.findTop50ByOrgKeyOrderByIdDesc(orgKey).stream().map(e -> Map.of("id", e.getId(), "orgKey", e.getOrgKey(), "eventType", e.getEventType(), "payload", e.getPayload(), "hash", e.getEventHash(), "createdAt", String.valueOf(e.getCreatedAt()))).toList();
  }

  @GetMapping("/api/audit/dashboard/summary")
  public Map<String, Object> summary(@RequestParam String orgKey) {
    List<AuditEvent> events = repo.findByOrgKeyOrderByIdAsc(orgKey);
    String lastTime = events.isEmpty() ? null : String.valueOf(events.get(events.size() - 1).getCreatedAt());
    boolean ok = verifyChain(events);
    return Map.of(
      "audit_events_count", events.size(),
      "last_event_time", lastTime,
      "verify_ok", ok
    );
  }

  private boolean verifyChain(List<AuditEvent> events) {
    String prev = "GENESIS";
    for (AuditEvent e : events) {
      if (!prev.equals(e.getPrevHash())) return false;
      if (e.getEventHash() == null || e.getEventHash().isBlank()) return false;
      prev = e.getEventHash();
    }
    return true;
  }

  private String hmac(String input) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return Base64.getEncoder().encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception ex) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "AUDIT_HASH", "Unable to compute hash");
    }
  }
}
