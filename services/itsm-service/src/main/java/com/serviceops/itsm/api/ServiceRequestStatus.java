package com.serviceops.itsm.api;

import java.util.Map;
import java.util.Set;

public enum ServiceRequestStatus {
  SUBMITTED,
  APPROVED,
  REJECTED,
  FULFILLED,
  CLOSED;

  private static final Map<ServiceRequestStatus, Set<ServiceRequestStatus>> ALLOWED_TRANSITIONS = Map.of(
      SUBMITTED, Set.of(APPROVED, REJECTED),
      APPROVED, Set.of(FULFILLED),
      REJECTED, Set.of(CLOSED),
      FULFILLED, Set.of(CLOSED),
      CLOSED, Set.of());

  public static ServiceRequestStatus fromDb(String value) {
    if (value == null || value.isBlank()) {
      return SUBMITTED;
    }
    return ServiceRequestStatus.valueOf(value.trim().toUpperCase());
  }

  public boolean canTransitionTo(ServiceRequestStatus target) {
    return ALLOWED_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
  }
}
