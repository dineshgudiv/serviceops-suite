package com.serviceops.cmdb.api;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@RestController
public class CmdbController {
  private final JdbcTemplate jdbc;
  private final TopologyService topologyService;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl}")
  private String auditBaseUrl;

  public CmdbController(JdbcTemplate jdbc, TopologyService topologyService, RestTemplate rest) {
    this.jdbc = jdbc;
    this.topologyService = topologyService;
    this.rest = rest;
  }

  @GetMapping("/api/cmdb/cis")
  public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt) {
    return jdbc.queryForList("""
      SELECT id,ci_key,name,type,status,owner,environment,criticality,service_key,updated_at,created_at
      FROM cmdb.cis WHERE org_key=? ORDER BY id DESC
      """, jwt.getClaimAsString("orgKey")).stream().map(this::toCiResponse).toList();
  }

  @PostMapping("/api/cmdb/cis")
  public Map<String,Object> create(@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    requireAnalystOrAdmin(jwt, "CMDB CI creation");
    String org=jwt.getClaimAsString("orgKey");
    String ciKey=body.getOrDefault("ci_key",UUID.randomUUID().toString());
    Map<String, Object> after = new LinkedHashMap<>();
    after.put("ci_key", ciKey);
    after.put("name", body.getOrDefault("name","Unnamed CI"));
    after.put("type", body.getOrDefault("type","SERVICE"));
    after.put("status", body.getOrDefault("status","ACTIVE"));
    after.put("owner", body.getOrDefault("owner", ""));
    after.put("environment", body.getOrDefault("environment","prod"));
    after.put("criticality", body.getOrDefault("criticality","MED"));
    after.put("service_key", body.getOrDefault("service_key",""));
    jdbc.update("""
      INSERT INTO cmdb.cis(org_key,ci_key,name,type,status,owner,environment,criticality,service_key,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,now())
      """,org,ciKey,after.get("name"),after.get("type"),after.get("status"),after.get("owner"),after.get("environment"),after.get("criticality"),after.get("service_key"));
    emitAudit("cmdb.ci_created", org, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "create",
      "targetType", "cmdb_ci",
      "targetId", ciKey,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of(),
      "after", after
    ));
    return Map.of("ci_key",ciKey,"id",ciKey);
  }

  @PostMapping("/api/cmdb/relationships")
  public Map<String,Object> rel(@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    requireAnalystOrAdmin(jwt, "CMDB relationship creation");
    String orgKey = jwt.getClaimAsString("orgKey");
    String fromCiKey = body.getOrDefault("from_ci_key", "").trim();
    String toCiKey = body.getOrDefault("to_ci_key", "").trim();
    if (fromCiKey.isBlank() || toCiKey.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "CMDB_RELATIONSHIP_REQUIRED", "from_ci_key and to_ci_key are required");
    }
    Map<String, Object> after = Map.of(
      "from_ci_key", fromCiKey,
      "to_ci_key", toCiKey,
      "rel_type", body.getOrDefault("rel_type","depends_on"),
      "source", body.getOrDefault("source","manual"),
      "confidence", Double.parseDouble(body.getOrDefault("confidence","1.0"))
    );
    jdbc.update("""
      INSERT INTO cmdb.relationships(org_key,from_ci_key,to_ci_key,rel_type,source,confidence)
      VALUES (?,?,?,?,?,?)
      """,orgKey,fromCiKey,toCiKey,after.get("rel_type"),after.get("source"),after.get("confidence"));
    emitAudit("cmdb.relationship_created", orgKey, req, Map.of(
      "actor", jwt.getSubject(),
      "action", "create_relationship",
      "targetType", "cmdb_relationship",
      "targetId", fromCiKey + "->" + toCiKey,
      "timestamp", OffsetDateTime.now().toString(),
      "before", Map.of(),
      "after", after
    ));
    return Map.of("status","ok");
  }

  @GetMapping("/api/cmdb/impact")
  public Map<String,Object> impact(@RequestParam(name = "ciKey", required = false) String ciKey, @RequestParam(name = "ciId", required = false) String ciId, @RequestParam(defaultValue = "2") int depth,@AuthenticationPrincipal Jwt jwt){
    String target = ciKey != null && !ciKey.isBlank() ? ciKey : ciId;
    if (target == null || target.isBlank()) {
      throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "CMDB_IMPACT_REQUIRED", "ciId or ciKey is required");
    }
    return topologyService.blastRadius(jwt.getClaimAsString("orgKey"), target, Math.max(1, Math.min(depth, 4)));
  }

  @GetMapping("/api/cmdb/cis/{id}")
  public Map<String, Object> getCi(@PathVariable String id, @AuthenticationPrincipal Jwt jwt) {
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT ci_key,name,type,status,owner,environment,criticality,service_key,updated_at,created_at
      FROM cmdb.cis WHERE org_key=? AND ci_key=?
      """, jwt.getClaimAsString("orgKey"), id);
    if (rows.isEmpty()) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "CMDB_CI_NOT_FOUND", "CI not found");
    }
    return toCiResponse(rows.getFirst());
  }

  @GetMapping("/api/cmdb/cis/{id}/relations")
  public List<Map<String, Object>> relations(@PathVariable String id, @AuthenticationPrincipal Jwt jwt) {
    return topologyService.fetchRelations(jwt.getClaimAsString("orgKey"), id).stream().map(row -> Map.<String, Object>of(
      "fromId", row.get("from_ci_key"),
      "fromName", Objects.toString(row.get("from_name"), Objects.toString(row.get("from_ci_key"), "")),
      "toId", row.get("to_ci_key"),
      "toName", Objects.toString(row.get("to_name"), Objects.toString(row.get("to_ci_key"), "")),
      "type", row.get("rel_type"),
      "source", row.get("source"),
      "confidence", row.get("confidence")
    )).toList();
  }

  @GetMapping("/api/cmdb/cis/{id}/neighbors")
  public Map<String, Object> neighbors(@PathVariable String id, @RequestParam(defaultValue = "both") String direction, @RequestParam(defaultValue = "2") int depth, @AuthenticationPrincipal Jwt jwt) {
    return Map.of(
      "id", id,
      "items", topologyService.neighbors(jwt.getClaimAsString("orgKey"), id, direction, Math.max(1, Math.min(depth, 4)))
    );
  }

  @GetMapping("/api/cmdb/services/{serviceKey}/dependency-view")
  public Map<String, Object> dependencyView(@PathVariable String serviceKey, @AuthenticationPrincipal Jwt jwt) {
    return topologyService.dependencyView(jwt.getClaimAsString("orgKey"), serviceKey);
  }

  private Map<String, Object> toCiResponse(Map<String, Object> row) {
    return Map.<String, Object>of(
      "id", row.get("ci_key"),
      "name", row.get("name"),
      "type", row.get("type"),
      "status", row.get("status"),
      "owner", Objects.toString(row.get("owner"), ""),
      "environment", row.get("environment"),
      "criticality", row.get("criticality"),
      "service_key", Objects.toString(row.get("service_key"), ""),
      "updated_at", row.get("updated_at"),
      "created_at", row.get("created_at")
    );
  }

  private void requireAnalystOrAdmin(Jwt jwt, String action) {
    String role = jwt.getClaimAsString("role");
    if (!"ADMIN".equals(role) && !"ANALYST".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires ANALYST or ADMIN role");
    }
  }

  private void emitAudit(String eventType, String orgKey, jakarta.servlet.http.HttpServletRequest req, Map<String, Object> payload) {
    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setContentType(MediaType.APPLICATION_JSON);
      headers.set("X-Request-ID", String.valueOf(req.getAttribute("request_id")));
      rest.postForEntity(
          auditBaseUrl + "/api/audit/events",
          new HttpEntity<>(Map.of("orgKey", orgKey, "eventType", eventType, "payload", payload), headers),
          Map.class);
    } catch (RestClientException ex) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "AUDIT_DOWNSTREAM", "Audit downstream call failed");
    }
  }
}
