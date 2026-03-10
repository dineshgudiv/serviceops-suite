package com.serviceops.workflow.api;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
@RestControllerAdvice
public class ErrorHandler {
  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String,Object>> api(ApiException ex, jakarta.servlet.http.HttpServletRequest req) {
    return ResponseEntity.status(ex.status()).body(Map.of("error", Map.of("code", ex.code(), "message", ex.getMessage()), "request_id", String.valueOf(req.getAttribute("request_id"))));
  }
  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String,Object>> generic(Exception ex, jakarta.servlet.http.HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", Map.of("code", "INTERNAL", "message", ex.getMessage()), "request_id", String.valueOf(req.getAttribute("request_id"))));
  }
}
