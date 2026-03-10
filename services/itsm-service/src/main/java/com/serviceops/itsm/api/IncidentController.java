package com.serviceops.itsm.api;

import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class IncidentController {
  private final IncidentService incidents;

  public IncidentController(IncidentService incidents) {
    this.incidents = incidents;
  }

  @PostMapping("/api/itsm/incidents")
  public Map<String, Object> create(@RequestBody Map<String, String> body, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return incidents.create(body, jwt, req);
  }

  @GetMapping("/api/itsm/incidents")
  public List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt,
                                        @RequestParam(defaultValue = "") String q,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "25") int size) {
    return incidents.list(jwt, q, page, size);
  }

  @PostMapping("/api/itsm/incidents/{id}/assign")
  public Map<String, Object> assign(@PathVariable Long id, @RequestBody Map<String, String> body, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return incidents.assign(id, body, jwt, req);
  }

  @PostMapping("/api/itsm/incidents/{id}/investigate")
  public Map<String, Object> investigate(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return incidents.investigate(id, jwt, req);
  }

  @PostMapping("/api/itsm/incidents/{id}/resolve")
  public Map<String, Object> resolve(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return incidents.resolve(id, body == null ? Map.of() : body, jwt, req);
  }

  @PostMapping("/api/itsm/incidents/{id}/close")
  public Map<String, Object> close(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return incidents.close(id, jwt, req);
  }
}
