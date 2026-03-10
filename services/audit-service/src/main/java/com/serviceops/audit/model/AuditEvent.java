package com.serviceops.audit.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(schema = "audit", name = "audit_events")
public class AuditEvent {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  private String orgKey;
  private String eventType;
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private JsonNode payload;
  private String prevHash;
  private String eventHash;
  private OffsetDateTime createdAt;

  public Long getId() { return id; }
  public String getOrgKey() { return orgKey; }
  public void setOrgKey(String orgKey) { this.orgKey = orgKey; }
  public String getEventType() { return eventType; }
  public void setEventType(String eventType) { this.eventType = eventType; }
  public JsonNode getPayload() { return payload; }
  public void setPayload(JsonNode payload) { this.payload = payload; }
  public String getPrevHash() { return prevHash; }
  public void setPrevHash(String prevHash) { this.prevHash = prevHash; }
  public String getEventHash() { return eventHash; }
  public void setEventHash(String eventHash) { this.eventHash = eventHash; }
  public OffsetDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}

