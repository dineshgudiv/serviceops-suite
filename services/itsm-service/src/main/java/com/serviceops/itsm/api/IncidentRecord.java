package com.serviceops.itsm.api;

public record IncidentRecord(
    Long id,
    String orgKey,
    String title,
    String description,
    String severity,
    String impact,
    String urgency,
    String category,
    IncidentStatus status,
    String createdBy,
    String requester,
    String assignedTo,
    String serviceKey,
    String ciKey,
    String environment,
    String attachmentName,
    Object createdAt,
    Object updatedAt,
    Object resolvedAt) {
}
