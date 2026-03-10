package com.serviceops.knowledge.api;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class GovernedRetrievalService {
  private static final Pattern EMAIL = Pattern.compile("[\\w.\\-]+@[\\w.\\-]+");
  private static final Pattern SECRET = Pattern.compile("(?i)(api[_-]?key|password|secret|token)\\s*[:=]\\s*\\S+");
  private static final List<String> INJECTION_MARKERS = List.of(
    "ignore previous instructions",
    "reveal system prompt",
    "exfiltrate",
    "tool call",
    "sudo",
    "override policy"
  );

  private final JdbcTemplate jdbc;

  public GovernedRetrievalService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<Map<String, Object>> retrieve(String orgKey, String role, String question) {
    String wildcard = "%" + normalize(question) + "%";
    List<String> visibility = Arrays.asList(allowedVisibilities(role));
    return jdbc.queryForList("""
      SELECT id,title,content,source_type,source_ref,approval_status,visibility,service_key,ci_key,environment,tags,excerpt,updated_at
      FROM knowledge.documents
      WHERE org_key=?
        AND approval_status='approved'
      ORDER BY
        CASE WHEN LOWER(title) LIKE ? THEN 0 ELSE 1 END,
        CASE WHEN LOWER(content) LIKE ? THEN 0 ELSE 1 END,
        updated_at DESC, id DESC
      LIMIT 12
      """, orgKey, wildcard, wildcard).stream()
      .filter(row -> visibility.contains(String.valueOf(row.get("visibility"))))
      .limit(5)
      .toList();
  }

  public boolean containsPromptInjection(String content) {
    String normalized = normalize(content);
    return INJECTION_MARKERS.stream().anyMatch(normalized::contains);
  }

  public String sanitize(String content) {
    String redacted = EMAIL.matcher(content == null ? "" : content).replaceAll("[REDACTED_EMAIL]");
    redacted = SECRET.matcher(redacted).replaceAll("[REDACTED_SECRET]");
    return redacted;
  }

  public Map<String, Object> refusal(String reasonCode, String message) {
    return Map.of(
      "answer", "",
      "citations", List.of(),
      "refusal", Map.of("code", reasonCode, "message", message)
    );
  }

  public Map<String, Object> answer(String question, List<Map<String, Object>> docs) {
    if (docs.isEmpty()) {
      return refusal("NOT_ENOUGH_EVIDENCE", "No approved evidence matched the operational question.");
    }

    List<Map<String, Object>> citations = new ArrayList<>();
    List<Map<String, Object>> evidenceSpans = new ArrayList<>();
    StringBuilder answer = new StringBuilder();
    for (Map<String, Object> doc : docs) {
      String safeContent = sanitize(String.valueOf(doc.get("content")));
      if (containsPromptInjection(safeContent)) {
        continue;
      }
      String snippet = safeContent.length() > 220 ? safeContent.substring(0, 220) : safeContent;
      citations.add(Map.of(
        "doc_id", String.valueOf(doc.get("id")),
        "doc_title", String.valueOf(doc.get("title")),
        "quote", snippet
      ));
      evidenceSpans.add(Map.of(
        "doc_id", String.valueOf(doc.get("id")),
        "doc_title", String.valueOf(doc.get("title")),
        "text", snippet
      ));
      answer.append("- ").append(String.valueOf(doc.get("title"))).append(": ").append(snippet).append("\n");
    }

    if (citations.isEmpty()) {
      return refusal("UNTRUSTED_EVIDENCE", "Retrieved documents contained unsafe or injected instructions and were excluded.");
    }

    return Map.of(
      "answer", "Evidence-backed summary for: " + question + "\n" + answer.toString().trim(),
      "citations", citations,
      "evidence_spans", evidenceSpans
    );
  }

  private String[] allowedVisibilities(String role) {
    return switch (role == null ? "" : role.toLowerCase(Locale.ROOT)) {
      case "admin", "manager" -> new String[] {"viewer", "operator", "admin"};
      case "operator", "analyst" -> new String[] {"viewer", "operator"};
      default -> new String[] {"viewer"};
    };
  }

  public List<String> allowedVisibilitiesForRole(String role) {
    return Arrays.asList(allowedVisibilities(role));
  }

  private String normalize(String input) {
    return input == null ? "" : input.toLowerCase(Locale.ROOT);
  }
}
