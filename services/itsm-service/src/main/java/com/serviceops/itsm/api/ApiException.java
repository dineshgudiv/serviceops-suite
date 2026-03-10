package com.serviceops.itsm.api;

import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final String code;

  public ApiException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
  public HttpStatus status() { return status; }
  public String code() { return code; }

  public static ApiException badGateway(String message) { return new ApiException(HttpStatus.BAD_GATEWAY, "AUDIT_DOWNSTREAM", message); }
}
