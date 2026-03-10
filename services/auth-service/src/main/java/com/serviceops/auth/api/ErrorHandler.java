package com.serviceops.auth.api;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ErrorHandler {
  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handleApi(ApiException ex, jakarta.servlet.http.HttpServletRequest req) {
    return ResponseEntity.status(ex.status()).body(Map.of("error", Map.of("code", ex.code(), "message", ex.getMessage()), "request_id", String.valueOf(req.getAttribute("request_id"))));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handle(Exception ex, jakarta.servlet.http.HttpServletRequest req) {
    String message = ex.getMessage() == null ? "Unexpected error" : ex.getMessage();
    if (looksLikeAuthTokenFailure(message)) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", Map.of("code", "AUTH_INVALID", "message", "Invalid token"), "request_id", String.valueOf(req.getAttribute("request_id"))));
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", Map.of("code", "AUTH_INTERNAL", "message", ex.getMessage()), "request_id", String.valueOf(req.getAttribute("request_id"))));
  }

  private boolean looksLikeAuthTokenFailure(String message) {
    return message.contains("Invalid JWS header")
        || message.contains("Invalid JWT signature")
        || message.contains("Token expired")
        || message.contains("Signed JWT rejected")
        || message.contains("Malformed JWT")
        || message.contains("Bad JOSE");
  }
}
