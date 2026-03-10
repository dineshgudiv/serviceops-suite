package com.serviceops.itsm.api;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
public class ItsmController {
  private final JdbcTemplate jdbc;
  private final ChangeService changes;
  private final ProblemService problems;
  private final ServiceRequestService serviceRequests;
  private final RequesterPortalService requesterPortal;
  public ItsmController(JdbcTemplate jdbc, ChangeService changes, ProblemService problems, ServiceRequestService serviceRequests, RequesterPortalService requesterPortal) { this.jdbc = jdbc; this.changes = changes; this.problems = problems; this.serviceRequests = serviceRequests; this.requesterPortal = requesterPortal; }

  @GetMapping("/api/itsm/problems")
  public List<Map<String,Object>> problems(@AuthenticationPrincipal Jwt jwt) {
    return problems.list(jwt);
  }

  @PostMapping("/api/itsm/problems")
  public Map<String,Object> createProblem(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String,String> body, jakarta.servlet.http.HttpServletRequest req) {
    return problems.create(jwt, body, req);
  }

  @PatchMapping("/api/itsm/problems/{id}")
  public Map<String, Object> patchProblem(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body) {
    return problems.updateOwner(id, jwt, body);
  }

  @PostMapping("/api/itsm/problems/{id}/link-incident")
  public Map<String, Object> linkProblemIncident(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body, jakarta.servlet.http.HttpServletRequest req) {
    Object incidentId = body.get("incidentId");
    if (incidentId == null) {
      throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INCIDENT_ID_REQUIRED", "incidentId is required");
    }
    return problems.linkIncident(id, jwt, Long.valueOf(String.valueOf(incidentId)), req);
  }

  @PostMapping("/api/itsm/problems/{id}/root-cause")
  public Map<String, Object> rootCause(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return problems.identifyRootCause(id, jwt, body, req);
  }

  @PostMapping("/api/itsm/problems/{id}/known-error")
  public Map<String, Object> knownError(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return problems.markKnownError(id, jwt, body, req);
  }

  @PostMapping("/api/itsm/problems/{id}/close")
  public Map<String, Object> closeProblem(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return problems.close(id, jwt, req);
  }

  @GetMapping("/api/itsm/changes")
  public List<Map<String,Object>> changes(@AuthenticationPrincipal Jwt jwt) {
    return changes.list(jwt);
  }

  @PostMapping("/api/itsm/changes")
  public Map<String,Object> createChange(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String,String> body, jakarta.servlet.http.HttpServletRequest req) {
    return changes.createDraft(jwt, body, req);
  }

  @GetMapping("/api/itsm/service-requests")
  public List<Map<String, Object>> serviceRequests(@AuthenticationPrincipal Jwt jwt) {
    return serviceRequests.list(jwt);
  }

  @PostMapping("/api/itsm/service-requests")
  public Map<String, Object> createServiceRequest(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.create(jwt, body, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/assign")
  public Map<String, Object> assignServiceRequest(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.assign(id, jwt, body == null ? Map.of() : body, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/approve")
  public Map<String, Object> approveServiceRequest(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.approve(id, jwt, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/reject")
  public Map<String, Object> rejectServiceRequest(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.reject(id, jwt, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/fulfill")
  public Map<String, Object> fulfillServiceRequest(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.fulfill(id, jwt, body, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/close")
  public Map<String, Object> closeServiceRequest(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.close(id, jwt, req);
  }

  @PostMapping("/api/itsm/service-requests/{id}/comments")
  public Map<String, Object> addServiceRequestComment(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return serviceRequests.addAgentComment(id, jwt, body, req);
  }

  @GetMapping("/api/itsm/portal/requests")
  public List<Map<String, Object>> myRequests(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String q) {
    return requesterPortal.listMyRequests(jwt, q);
  }

  @GetMapping("/api/itsm/portal/requests/{kind}/{id}")
  public Map<String, Object> myRequestDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind, @PathVariable Long id) {
    return requesterPortal.getRequest(jwt, kind, id);
  }

  @GetMapping("/api/itsm/portal/requests/{kind}/{id}/comments")
  public List<Map<String, Object>> myRequestComments(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind, @PathVariable Long id) {
    return requesterPortal.listComments(jwt, kind, id);
  }

  @PostMapping("/api/itsm/portal/requests/{kind}/{id}/comments")
  public Map<String, Object> addMyRequestComment(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind, @PathVariable Long id, @RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest req) {
    return requesterPortal.addComment(jwt, kind, id, body, req);
  }

  @PatchMapping("/api/itsm/changes/{id}")
  public Map<String, Object> patchChange(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body) {
    return changes.updateOwner(id, jwt, body);
  }

  @PostMapping("/api/itsm/changes/{id}/submit")
  public Map<String, Object> submitChange(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return changes.submit(id, jwt, req);
  }

  @PostMapping("/api/itsm/changes/{id}/implement")
  public Map<String, Object> implementChange(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return changes.implement(id, jwt, req);
  }

  @PostMapping("/api/itsm/changes/{id}/review")
  public Map<String, Object> reviewChange(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return changes.review(id, jwt, req);
  }

  @GetMapping("/api/itsm/catalog")
  public List<Map<String,Object>> catalog(@AuthenticationPrincipal Jwt jwt) {
    return jdbc.queryForList("SELECT id,service_key,name,owner,sla_tier,created_at FROM itsm.catalog_services WHERE org_key=? ORDER BY id DESC", jwt.getClaimAsString("orgKey")).stream().map(row -> {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("id", row.get("service_key"));
      out.put("service_key", row.get("service_key"));
      out.put("name", row.get("name"));
      out.put("owner", Objects.toString(row.get("owner"), ""));
      out.put("tier", switch (String.valueOf(row.get("sla_tier")).toLowerCase()) {
        case "platinum" -> "TIER_0";
        case "gold" -> "TIER_1";
        case "silver" -> "TIER_2";
        default -> "TIER_3";
      });
      out.put("status", "ACTIVE");
      out.put("created_at", row.get("created_at"));
      out.put("updated_at", row.get("created_at"));
      return out;
    }).toList();
  }

  @PostMapping("/api/itsm/catalog")
  public Map<String,Object> createCatalog(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String,String> body) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Catalog service creation");
    Long id = jdbc.queryForObject("INSERT INTO itsm.catalog_services(org_key,service_key,name,owner,sla_tier) VALUES (?,?,?,?,?) RETURNING id", Long.class, jwt.getClaimAsString("orgKey"), body.getOrDefault("service_key","svc-"+System.currentTimeMillis()), body.getOrDefault("name","Service"), body.getOrDefault("owner","ops"), body.getOrDefault("sla_tier","gold"));
    return Map.of("id", id);
  }

  @PutMapping("/api/itsm/catalog/{serviceKey}")
  @PatchMapping("/api/itsm/catalog/{serviceKey}")
  public Map<String, Object> updateCatalog(@PathVariable String serviceKey, @AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, String> body) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Catalog service update");
    int changed = jdbc.update("""
      UPDATE itsm.catalog_services
      SET name=COALESCE(?,name), owner=COALESCE(?,owner), sla_tier=COALESCE(?,sla_tier)
      WHERE org_key=? AND service_key=?
      """, body.get("name"), body.get("owner"), body.get("sla_tier"), jwt.getClaimAsString("orgKey"), serviceKey);
    if (changed == 0) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "CATALOG_SERVICE_NOT_FOUND", "Service not found");
    }
    return Map.of("id", serviceKey);
  }

  @DeleteMapping("/api/itsm/catalog/{serviceKey}")
  public Map<String, Object> deleteCatalog(@PathVariable String serviceKey, @AuthenticationPrincipal Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Catalog service deletion");
    int changed = jdbc.update("DELETE FROM itsm.catalog_services WHERE org_key=? AND service_key=?", jwt.getClaimAsString("orgKey"), serviceKey);
    if (changed == 0) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "CATALOG_SERVICE_NOT_FOUND", "Service not found");
    }
    return Map.of("status", "deleted", "id", serviceKey);
  }

  @GetMapping("/api/itsm/catalog/{serviceKey}")
  public Map<String, Object> getCatalog(@PathVariable String serviceKey, @AuthenticationPrincipal Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Catalog service detail");
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT id,service_key,name,owner,sla_tier,created_at FROM itsm.catalog_services WHERE org_key=? AND service_key=?", jwt.getClaimAsString("orgKey"), serviceKey);
    if (rows.isEmpty()) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "CATALOG_SERVICE_NOT_FOUND", "Service not found");
    }
    Map<String, Object> row = rows.getFirst();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", row.get("service_key"));
    out.put("service_key", row.get("service_key"));
    out.put("name", row.get("name"));
    out.put("owner", Objects.toString(row.get("owner"), ""));
    out.put("tier", row.get("sla_tier"));
    out.put("created_at", row.get("created_at"));
    return out;
  }

  @GetMapping("/api/itsm/catalog/{serviceKey}/dependencies")
  public Map<String, Object> dependencies(@PathVariable String serviceKey, @AuthenticationPrincipal Jwt jwt) {
    RoleGuard.requireAnalystOrAdmin(jwt, "Catalog dependency access");
    return Map.of(
      "service_key", serviceKey,
      "items", jdbc.queryForList("""
        SELECT r.from_ci_key,r.to_ci_key,r.rel_type
        FROM cmdb.relationships r
        JOIN cmdb.cis c ON c.org_key=r.org_key AND c.ci_key=r.from_ci_key
        WHERE r.org_key=? AND c.service_key=?
        ORDER BY r.id DESC
        """, jwt.getClaimAsString("orgKey"), serviceKey)
    );
  }
}
