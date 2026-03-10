package com.serviceops.sla.api;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
@RestController
public class SlaController {
  private final JdbcTemplate jdbc;
  public SlaController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  @GetMapping("/api/sla/tickets/state")
  public Map<String,Object> state(@RequestParam Long incidentId, @AuthenticationPrincipal Jwt jwt) {
    String org = jwt.getClaimAsString("orgKey");
    Map<String,Object> row = jdbc.queryForMap("SELECT i.id,i.severity,EXTRACT(EPOCH FROM (now()-i.created_at))/60 as age_minutes, COALESCE((SELECT target_minutes FROM sla.policies p WHERE p.org_key=i.org_key AND p.severity=i.severity LIMIT 1),240) as target_minutes FROM itsm.incidents i WHERE i.org_key=? AND i.id=?", org, incidentId);
    int age = ((Number)row.get("age_minutes")).intValue();
    int target = ((Number)row.get("target_minutes")).intValue();
    return Map.of("incident_id",incidentId,"severity",String.valueOf(row.get("severity")),"age_minutes",age,"target_minutes",target,"breached",age>target);
  }
}
