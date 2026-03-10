package com.serviceops.itsm.api;

import java.util.List;
import java.util.Map;

public record ProblemRecord(
    Long id,
    String orgKey,
    String title,
    ProblemStatus status,
    String owner,
    String serviceKey,
    String summary,
    String impactSummary,
    String rootCause,
    String knownError,
    Object createdAt,
    Object updatedAt,
    List<Map<String, Object>> linkedIncidents) {
}
