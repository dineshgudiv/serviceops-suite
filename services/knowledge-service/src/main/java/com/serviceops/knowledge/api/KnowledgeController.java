package com.serviceops.knowledge.api;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
public class KnowledgeController {
  private final JdbcTemplate jdbc;
  private final GovernedRetrievalService retrievalService;
  private final RestTemplate rest;

  @Value("${app.auditBaseUrl:http://audit-service:8088}")
  private String auditBaseUrl;

  public KnowledgeController(JdbcTemplate jdbc, GovernedRetrievalService retrievalService, RestTemplate rest) {
    this.jdbc = jdbc;
    this.retrievalService = retrievalService;
    this.rest = rest;
  }

  @GetMapping("/api/knowledge/documents")
  public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt){
    return jdbc.queryForList("""
      SELECT id,title,source_type,approval_status,visibility,service_key,ci_key,environment,tags,excerpt,created_at,updated_at
      FROM knowledge.documents WHERE org_key=? ORDER BY id DESC
      """,jwt.getClaimAsString("orgKey")).stream().map(row -> {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("id", row.get("id"));
      out.put("title", row.get("title"));
      out.put("source", row.get("source_type"));
      out.put("approval_status", row.get("approval_status"));
      out.put("visibility", row.get("visibility"));
      out.put("service_key", Objects.toString(row.get("service_key"), ""));
      out.put("ci_key", Objects.toString(row.get("ci_key"), ""));
      out.put("environment", row.get("environment"));
      out.put("tags", splitTags(Objects.toString(row.get("tags"), "")));
      out.put("excerpt", row.get("excerpt"));
      out.put("created_at", row.get("created_at"));
      out.put("updated_at", row.get("updated_at"));
      return out;
    }).toList();
  }

  @GetMapping("/api/knowledge/portal/documents")
  public List<Map<String, Object>> portalList(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "") String q) {
    String orgKey = jwt.getClaimAsString("orgKey");
    String wildcard = "%" + Objects.toString(q, "").trim().toLowerCase() + "%";
    List<String> visibility = retrievalService.allowedVisibilitiesForRole(jwt.getClaimAsString("role"));
    return jdbc.queryForList("""
      SELECT id,title,excerpt,service_key,tags,updated_at,created_at,visibility
      FROM knowledge.documents
      WHERE org_key=?
        AND approval_status='approved'
        AND (? = '%%' OR LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(excerpt) LIKE ?)
      ORDER BY updated_at DESC, id DESC
      """, orgKey, wildcard, wildcard, wildcard, wildcard).stream()
      .filter(row -> visibility.contains(String.valueOf(row.get("visibility"))))
      .map(row -> {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("title", row.get("title"));
        out.put("excerpt", row.get("excerpt"));
        out.put("service_key", Objects.toString(row.get("service_key"), ""));
        out.put("tags", splitTags(Objects.toString(row.get("tags"), "")));
        out.put("updated_at", row.get("updated_at"));
        out.put("created_at", row.get("created_at"));
        return out;
      }).toList();
  }

  @GetMapping("/api/knowledge/portal/documents/{id}")
  public Map<String, Object> portalDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
    String orgKey = jwt.getClaimAsString("orgKey");
    List<String> visibility = retrievalService.allowedVisibilitiesForRole(jwt.getClaimAsString("role"));
    List<Map<String, Object>> rows = jdbc.queryForList("""
      SELECT id,title,content,excerpt,service_key,ci_key,environment,tags,updated_at,created_at,visibility
      FROM knowledge.documents
      WHERE org_key=? AND id=? AND approval_status='approved'
      """, orgKey, id);
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge article not found");
    }
    Map<String, Object> row = rows.getFirst();
    if (!visibility.contains(String.valueOf(row.get("visibility")))) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", "Knowledge article is not available to this role");
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", row.get("id"));
    out.put("title", row.get("title"));
    out.put("content", row.get("content"));
    out.put("excerpt", row.get("excerpt"));
    out.put("service_key", Objects.toString(row.get("service_key"), ""));
    out.put("ci_key", Objects.toString(row.get("ci_key"), ""));
    out.put("environment", Objects.toString(row.get("environment"), ""));
    out.put("tags", splitTags(Objects.toString(row.get("tags"), "")));
    out.put("updated_at", row.get("updated_at"));
    out.put("created_at", row.get("created_at"));
    return out;
  }

  @PostMapping({"/api/knowledge/documents","/api/v1/rag/upload"})
  public Map<String,Object> upload(@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req){
    String org=jwt.getClaimAsString("orgKey");
    String role = jwt.getClaimAsString("role");
    requireAnalystOrAdmin(role, "Knowledge document write");
    String title=body.getOrDefault("title",body.getOrDefault("source","Untitled"));
    String content=body.getOrDefault("content",body.getOrDefault("text",""));
    String approvalStatus = body.getOrDefault("approval_status", "approved");
    String sourceType = body.getOrDefault("source_type", body.getOrDefault("source", "kb"));
    String visibility = body.getOrDefault("visibility", "viewer");
    if ("approved".equalsIgnoreCase(approvalStatus) || "admin".equalsIgnoreCase(visibility)) {
      requireAdmin(role, "Knowledge publish");
    }
    String sanitizedContent = retrievalService.sanitize(content);
    Long id=jdbc.queryForObject("""
      INSERT INTO knowledge.documents(org_key,title,content,source_type,source_ref,approval_status,visibility,service_key,ci_key,environment,tags,excerpt,created_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,now()) RETURNING id
      """,Long.class,org,title,sanitizedContent,sourceType,body.getOrDefault("source_ref",""),approvalStatus,visibility,body.getOrDefault("service_key",""),body.getOrDefault("ci_key",""),body.getOrDefault("environment","prod"),body.getOrDefault("tags",""),excerpt(sanitizedContent),jwt.getSubject());
    Map<String, Object> after = new LinkedHashMap<>();
    after.put("id", id);
    after.put("title", title);
    after.put("approval_status", approvalStatus);
    after.put("visibility", visibility);
    after.put("service_key", body.getOrDefault("service_key", ""));
    after.put("ci_key", body.getOrDefault("ci_key", ""));
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("actor", jwt.getSubject());
    payload.put("action", "approved".equalsIgnoreCase(approvalStatus) ? "publish" : "create");
    payload.put("targetType", "knowledge_document");
    payload.put("targetId", id);
    payload.put("timestamp", OffsetDateTime.now().toString());
    payload.put("before", Map.of());
    payload.put("after", after);
    emitAudit("approved".equalsIgnoreCase(approvalStatus) ? "knowledge.document_published" : "knowledge.document_created", org, req, payload);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("id", id);
    response.put("documentId", String.valueOf(id));
    response.put("status", approvalStatus.equals("approved") ? "indexed" : "draft");
    return response;
  }

  @PostMapping({"/api/knowledge/ask","/api/v1/rag/ask"})
  public Map<String,Object> ask(@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt){
    String org=jwt.getClaimAsString("orgKey");
    String q=body.getOrDefault("question",body.getOrDefault("query",""));
    String role = jwt.getClaimAsString("role");
    List<Map<String,Object>> docs=retrievalService.retrieve(org, role, q);
    Map<String, Object> result = retrievalService.answer(q, docs);
    Long logId = jdbc.queryForObject("""
      INSERT INTO knowledge.retrieval_logs(org_key,username,role,question,refusal_code,selected_doc_ids)
      VALUES (?,?,?,?,?,?) RETURNING id
      """, Long.class, org, jwt.getSubject(), role == null ? "" : role, q,
      result.containsKey("refusal") ? String.valueOf(((Map<?, ?>) result.get("refusal")).get("code")) : null,
      docs.stream().map(doc -> String.valueOf(doc.get("id"))).reduce((a, b) -> a + "," + b).orElse(""));
    jdbc.update("""
      INSERT INTO knowledge.policy_decisions(org_key,retrieval_log_id,decision_type,decision,reason)
      VALUES (?,?,?,?,?)
      """, org, logId, "retrieval", result.containsKey("refusal") ? "deny" : "allow",
      result.containsKey("refusal") ? String.valueOf(((Map<?, ?>) result.get("refusal")).get("message")) : "approved evidence returned");
    Map<String, Object> out = new LinkedHashMap<>(result);
    out.put("request_id", "knowledge-" + logId);
    out.put("latency_ms", 0);
    return out;
  }

  @GetMapping("/api/knowledge/rag-eval")
  public Map<String, Object> ragEval() {
    throw new ApiException(org.springframework.http.HttpStatus.NOT_IMPLEMENTED, "NOT_IMPLEMENTED", "RAG evaluation harness is scaffolded but not implemented in this slice");
  }

  private void requireAnalystOrAdmin(String role, String action) {
    if (!"ADMIN".equals(role) && !"ANALYST".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires ANALYST or ADMIN role");
    }
  }

  private void requireAdmin(String role, String action) {
    if (!"ADMIN".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires ADMIN role");
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

  private List<String> splitTags(String csv) {
    if (csv == null || csv.isBlank()) {
      return List.of();
    }
    return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
  }

  private String excerpt(String content) {
    if (content == null || content.isBlank()) {
      return "";
    }
    return content.length() > 180 ? content.substring(0, 180) : content;
  }
}
