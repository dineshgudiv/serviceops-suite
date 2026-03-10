package com.serviceops.integrations.config;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
@Configuration
public class AppConfig {
  @Bean
  SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.csrf(csrf -> csrf.disable())
      .authorizeHttpRequests(auth -> auth.requestMatchers("/actuator/health").permitAll().requestMatchers(HttpMethod.GET, "/api/integrations/**").authenticated().requestMatchers(HttpMethod.POST, "/api/integrations/**").authenticated().anyRequest().authenticated())
      .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(converter())));
    return http.build();
  }
  @Bean
  jakarta.servlet.Filter requestIdFilter() {
    return new org.springframework.web.filter.OncePerRequestFilter() {
      @Override protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest req, jakarta.servlet.http.HttpServletResponse res, jakarta.servlet.FilterChain chain) throws java.io.IOException, jakarta.servlet.ServletException {
        String id = req.getHeader("X-Request-ID"); if (id == null || id.isBlank()) id = UUID.randomUUID().toString(); req.setAttribute("request_id", id); res.setHeader("X-Request-ID", id); chain.doFilter(req, res);
      }
    };
  }
  private JwtAuthenticationConverter converter() {
    JwtAuthenticationConverter c = new JwtAuthenticationConverter();
    c.setJwtGrantedAuthoritiesConverter(jwt -> java.util.List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getClaimAsString("role"))));
    return c;
  }
}
