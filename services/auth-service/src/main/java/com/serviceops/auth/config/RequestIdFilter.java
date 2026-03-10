package com.serviceops.auth.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestIdFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
    String requestId = req.getHeader("X-Request-ID");
    if (requestId == null || requestId.isBlank()) requestId = UUID.randomUUID().toString();
    req.setAttribute("request_id", requestId);
    res.setHeader("X-Request-ID", requestId);
    chain.doFilter(req, res);
  }
}
