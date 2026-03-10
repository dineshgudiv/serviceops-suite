package com.serviceops.itsm.api;

import java.util.Map;
import java.util.Set;

public enum IncidentStatus {
  NEW,
  ASSIGNED,
  INVESTIGATING,
  RESOLVED,
  CLOSED;

  private static final Map<IncidentStatus, Set<IncidentStatus>> ALLOWED_TRANSITIONS = Map.of(
      NEW, Set.of(ASSIGNED),
      ASSIGNED, Set.of(INVESTIGATING),
      INVESTIGATING, Set.of(RESOLVED),
      RESOLVED, Set.of(CLOSED),
      CLOSED, Set.of());

  public static IncidentStatus fromDb(String value) {
    if (value == null || value.isBlank()) {
      return NEW;
    }
    return IncidentStatus.valueOf(value.trim().toUpperCase());
  }

  public boolean canTransitionTo(IncidentStatus target) {
    return ALLOWED_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
  }
}
