package com.serviceops.itsm.api;

public record ChangeRecord(
    Long id,
    String orgKey,
    String title,
    ChangeStatus status,
    String risk,
    String serviceKey,
    String ciKey,
    String environment,
    String owner,
    String requestedBy,
    String approvedBy,
    String rejectedBy,
    String description,
    String reason,
    String plan,
    String rollbackPlan,
    String previewCommand,
    Object changeWindowStart,
    Object changeWindowEnd,
    Object createdAt,
    Object updatedAt,
    Object approvedAt,
    Object rejectedAt,
    Object implementedAt,
    Object reviewedAt) {
}
