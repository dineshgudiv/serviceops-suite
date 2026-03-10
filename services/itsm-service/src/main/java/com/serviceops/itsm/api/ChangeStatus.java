package com.serviceops.itsm.api;

import java.util.Map;
import java.util.Set;

public enum ChangeStatus {
  DRAFT,
  SUBMITTED,
  APPROVED,
  REJECTED,
  IMPLEMENTED,
  REVIEWED;

  private static final Map<ChangeStatus, Set<ChangeStatus>> ALLOWED_TRANSITIONS = Map.of(
      DRAFT, Set.of(SUBMITTED),
      SUBMITTED, Set.of(),
      APPROVED, Set.of(IMPLEMENTED),
      REJECTED, Set.of(),
      IMPLEMENTED, Set.of(REVIEWED),
      REVIEWED, Set.of());

  public static ChangeStatus fromDb(String value) {
    if (value == null || value.isBlank()) {
      return DRAFT;
    }
    return ChangeStatus.valueOf(value.trim().toUpperCase());
  }

  public boolean canTransitionTo(ChangeStatus target) {
    return ALLOWED_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
  }
}
