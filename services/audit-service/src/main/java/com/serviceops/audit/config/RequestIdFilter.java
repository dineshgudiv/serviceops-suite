package com.serviceops.audit.config;

import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestIdFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest req, jakarta.servlet.http.HttpServletResponse res, jakarta.servlet.FilterChain chain) throws java.io.IOException, jakarta.servlet.ServletException {
    String id = req.getHeader("X-Request-ID");
    if (id == null || id.isBlank()) id = UUID.randomUUID().toString();
    req.setAttribute("request_id", id);
    res.setHeader("X-Request-ID", id);
    chain.doFilter(req, res);
  }
}
