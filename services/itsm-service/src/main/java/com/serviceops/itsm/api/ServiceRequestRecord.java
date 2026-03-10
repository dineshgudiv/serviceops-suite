package com.serviceops.itsm.api;

public record ServiceRequestRecord(
    Long id,
    String orgKey,
    String serviceKey,
    String shortDescription,
    String justification,
    String createdByUserId,
    String requester,
    String approvalTarget,
    String status,
    String assignedTo,
    String attachmentName,
    String resolutionSummary,
    String approvedBy,
    String rejectedBy,
    Object createdAt,
    Object updatedAt,
    Object approvedAt,
    Object rejectedAt,
    Object fulfilledAt,
    Object closedAt) {
}
