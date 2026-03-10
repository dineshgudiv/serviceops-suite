package com.serviceops.audit.repo;

import com.serviceops.audit.model.AuditEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {
  List<AuditEvent> findByOrgKeyOrderByIdAsc(String orgKey);
  List<AuditEvent> findTop50ByOrgKeyOrderByIdDesc(String orgKey);
}
