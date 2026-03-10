package com.serviceops.itsm.api;

import java.util.Map;
import java.util.Set;

public enum ProblemStatus {
  CREATED,
  INCIDENT_LINKED,
  ROOT_CAUSE_IDENTIFIED,
  KNOWN_ERROR,
  CLOSED;

  private static final Map<ProblemStatus, Set<ProblemStatus>> ALLOWED_TRANSITIONS = Map.of(
      CREATED, Set.of(INCIDENT_LINKED),
      INCIDENT_LINKED, Set.of(ROOT_CAUSE_IDENTIFIED),
      ROOT_CAUSE_IDENTIFIED, Set.of(KNOWN_ERROR),
      KNOWN_ERROR, Set.of(CLOSED),
      CLOSED, Set.of());

  public static ProblemStatus fromDb(String value) {
    if (value == null || value.isBlank()) {
      return CREATED;
    }
    return ProblemStatus.valueOf(value.trim().toUpperCase());
  }

  public boolean canTransitionTo(ProblemStatus target) {
    return ALLOWED_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
  }
}
