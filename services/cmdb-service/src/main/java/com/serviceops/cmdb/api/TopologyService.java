package com.serviceops.cmdb.api;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class TopologyService {
  private final JdbcTemplate jdbc;

  public TopologyService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<Map<String, Object>> fetchRelations(String orgKey, String ciKey) {
    return jdbc.queryForList("""
      SELECT
        r.from_ci_key,
        f.name AS from_name,
        r.to_ci_key,
        t.name AS to_name,
        r.rel_type,
        r.source,
        r.confidence,
        r.created_at
      FROM cmdb.relationships r
      LEFT JOIN cmdb.cis f ON f.org_key=r.org_key AND f.ci_key=r.from_ci_key
      LEFT JOIN cmdb.cis t ON t.org_key=r.org_key AND t.ci_key=r.to_ci_key
      WHERE r.org_key=? AND (r.from_ci_key=? OR r.to_ci_key=?)
      ORDER BY r.created_at DESC, r.id DESC
      """, orgKey, ciKey, ciKey);
  }

  public List<Map<String, Object>> neighbors(String orgKey, String ciKey, String direction, int depth) {
    Map<String, Map<String, Object>> ciByKey = new HashMap<>();
    for (Map<String, Object> row : jdbc.queryForList("""
      SELECT ci_key,name,type,status,owner,environment,criticality,service_key
      FROM cmdb.cis WHERE org_key=?
      """, orgKey)) {
      ciByKey.put(String.valueOf(row.get("ci_key")), row);
    }

    List<Map<String, Object>> rels = jdbc.queryForList("""
      SELECT from_ci_key,to_ci_key,rel_type,source,confidence
      FROM cmdb.relationships
      WHERE org_key=?
      """, orgKey);

    Map<String, List<Map<String, Object>>> outgoing = new HashMap<>();
    Map<String, List<Map<String, Object>>> incoming = new HashMap<>();
    for (Map<String, Object> rel : rels) {
      outgoing.computeIfAbsent(String.valueOf(rel.get("from_ci_key")), key -> new ArrayList<>()).add(rel);
      incoming.computeIfAbsent(String.valueOf(rel.get("to_ci_key")), key -> new ArrayList<>()).add(rel);
    }

    Set<String> visited = new HashSet<>();
    Deque<Step> queue = new ArrayDeque<>();
    queue.add(new Step(ciKey, 0));
    visited.add(ciKey);

    List<Map<String, Object>> nodes = new ArrayList<>();
    while (!queue.isEmpty()) {
      Step current = queue.removeFirst();
      if (current.depth >= depth) {
        continue;
      }
      Collection<Map<String, Object>> nextEdges = switch (direction) {
        case "upstream" -> incoming.getOrDefault(current.ciKey, List.of());
        case "downstream" -> outgoing.getOrDefault(current.ciKey, List.of());
        default -> {
          List<Map<String, Object>> combined = new ArrayList<>();
          combined.addAll(outgoing.getOrDefault(current.ciKey, List.of()));
          combined.addAll(incoming.getOrDefault(current.ciKey, List.of()));
          yield combined;
        }
      };

      for (Map<String, Object> edge : nextEdges) {
        String next = current.ciKey.equals(String.valueOf(edge.get("from_ci_key")))
          ? String.valueOf(edge.get("to_ci_key"))
          : String.valueOf(edge.get("from_ci_key"));
        if (!visited.add(next)) {
          continue;
        }
        Map<String, Object> ci = new LinkedHashMap<>(ciByKey.getOrDefault(next, Map.of("ci_key", next, "name", next)));
        ci.put("distance", current.depth + 1);
        ci.put("relationship_type", edge.get("rel_type"));
        ci.put("relationship_source", edge.get("source"));
        ci.put("confidence", edge.get("confidence"));
        nodes.add(ci);
        queue.add(new Step(next, current.depth + 1));
      }
    }
    return nodes;
  }

  public Map<String, Object> dependencyView(String orgKey, String serviceKey) {
    List<Map<String, Object>> serviceNodes = jdbc.queryForList("""
      SELECT ci_key,name,type,status,owner,environment,criticality,service_key
      FROM cmdb.cis WHERE org_key=? AND service_key=?
      ORDER BY name
      """, orgKey, serviceKey);
    if (serviceNodes.isEmpty()) {
      throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "CMDB_SERVICE_NOT_FOUND", "Service not found");
    }
    Set<String> ciKeys = new LinkedHashSet<>();
    for (Map<String, Object> row : serviceNodes) {
      ciKeys.add(String.valueOf(row.get("ci_key")));
    }
    List<Map<String, Object>> edges = new ArrayList<>();
    for (String ciKey : ciKeys) {
      edges.addAll(fetchRelations(orgKey, ciKey));
    }
    return Map.of(
      "service_key", serviceKey,
      "nodes", serviceNodes,
      "edges", edges
    );
  }

  public Map<String, Object> blastRadius(String orgKey, String ciKey, int depth) {
    List<Map<String, Object>> impacted = neighbors(orgKey, ciKey, "downstream", depth);
    Set<String> impactedServices = new LinkedHashSet<>();
    for (Map<String, Object> row : impacted) {
      Object serviceKey = row.get("service_key");
      if (serviceKey != null && !String.valueOf(serviceKey).isBlank()) {
        impactedServices.add(String.valueOf(serviceKey));
      }
    }
    List<Map<String, Object>> openIncidents = new ArrayList<>();
    List<Map<String, Object>> openChanges = new ArrayList<>();
    for (String serviceKey : impactedServices) {
      openIncidents.addAll(jdbc.queryForList("""
        SELECT id,title,severity,status,service_key
        FROM itsm.incidents
        WHERE org_key=? AND status NOT IN ('RESOLVED','CLOSED') AND service_key=?
        ORDER BY id DESC
        """, orgKey, serviceKey));
      openChanges.addAll(jdbc.queryForList("""
        SELECT id,title,risk,status,service_key
        FROM itsm.changes
        WHERE org_key=? AND status NOT IN ('COMPLETED','CANCELLED','REJECTED') AND service_key=?
        ORDER BY id DESC
        """, orgKey, serviceKey));
    }

    return Map.of(
      "ci_id", ciKey,
      "ciId", ciKey,
      "depth", depth,
      "impacted_nodes", impacted,
      "impacted_services", impactedServices.stream().map(service -> Map.of("id", service, "name", service)).toList(),
      "impactedServices", impactedServices.stream().map(service -> Map.of("id", service, "name", service)).toList(),
      "open_incidents", openIncidents,
      "openIncidents", openIncidents,
      "open_changes", openChanges,
      "openChanges", openChanges
    );
  }

  private record Step(String ciKey, int depth) {}
}
