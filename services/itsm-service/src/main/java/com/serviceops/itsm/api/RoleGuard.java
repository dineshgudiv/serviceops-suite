package com.serviceops.itsm.api;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;

final class RoleGuard {
  private RoleGuard() {}

  static boolean isAnalystOrAdmin(Jwt jwt) {
    String role = jwt.getClaimAsString("role");
    return "ADMIN".equals(role) || "ANALYST".equals(role);
  }

  static boolean isRequesterOrOperator(Jwt jwt) {
    String role = jwt.getClaimAsString("role");
    return "ADMIN".equals(role) || "ANALYST".equals(role) || "REQUESTER".equals(role);
  }

  static void requireAnalystOrAdmin(Jwt jwt, String action) {
    if (!isAnalystOrAdmin(jwt)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires ANALYST or ADMIN role");
    }
  }

  static void requireRequesterOrOperator(Jwt jwt, String action) {
    if (!isRequesterOrOperator(jwt)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires REQUESTER, ANALYST, or ADMIN role");
    }
  }

  static void requireAdmin(Jwt jwt, String action) {
    String role = jwt.getClaimAsString("role");
    if (!"ADMIN".equals(role)) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", action + " requires ADMIN role");
    }
  }
}
