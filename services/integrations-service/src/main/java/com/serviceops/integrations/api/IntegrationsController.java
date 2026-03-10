package com.serviceops.integrations.api;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController
public class IntegrationsController {
  private final JdbcTemplate jdbc;
  public IntegrationsController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  @PostMapping("/api/integrations/webhook")
  public Map<String,Object> webhook(@RequestBody Map<String,Object> body,@AuthenticationPrincipal Jwt jwt){
    jdbc.update("INSERT INTO integrations.webhook_events(org_key,event_type,payload) VALUES (?,?,?::jsonb)",jwt.getClaimAsString("orgKey"),String.valueOf(body.getOrDefault("event_type","generic")),new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(body).toString());
    return Map.of("status","accepted");
  }
  @PostMapping("/api/integrations/test-notification")
  public Map<String,Object> test(@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt){
    jdbc.update("INSERT INTO integrations.notifications(org_key,channel,message) VALUES (?,?,?)",jwt.getClaimAsString("orgKey"),body.getOrDefault("channel","log"),body.getOrDefault("message","test"));
    return Map.of("status","sent");
  }
  @GetMapping("/api/integrations/notifications")
  public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt){
    return jdbc.queryForList("SELECT id,channel,message,created_at FROM integrations.notifications WHERE org_key=? ORDER BY id DESC LIMIT 50",jwt.getClaimAsString("orgKey"));
  }
}
