package com.serviceops.workflow.api;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WorkflowController {
  private final ChangeApprovalService approvals;

  public WorkflowController(ChangeApprovalService approvals) {
    this.approvals = approvals;
  }

  @GetMapping("/api/workflow/health/contracts")
  public Map<String, Object> contracts() {
    return Map.of(
      "automation", "scaffolded",
      "approvals", "itsm.change.lifecycle",
      "state", "implemented_for_change_approvals"
    );
  }

  @PostMapping("/api/workflow/approvals/{id}/approve")
  public Map<String, Object> approve(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return approvals.approve(id, jwt, req);
  }

  @PostMapping("/api/workflow/approvals/{id}/reject")
  public Map<String, Object> reject(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt, jakarta.servlet.http.HttpServletRequest req) {
    return approvals.reject(id, jwt, req);
  }
}
