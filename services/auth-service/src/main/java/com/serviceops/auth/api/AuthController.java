package com.serviceops.auth.api;

import com.nimbusds.jwt.JWTClaimsSet;
import com.serviceops.auth.domain.DevMailer;
import com.serviceops.auth.domain.JwtService;
import com.serviceops.auth.domain.PasswordService;
import com.serviceops.auth.domain.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
public class AuthController {
  private final JdbcTemplate jdbc;
  private final JwtService jwtService;
  private final PasswordService passwordService;
  private final TokenService tokenService;
  private final DevMailer mailer;
  private final int inviteTtlHours;
  private final int resetTtlMinutes;
  private final int verificationTtlHours;

  public AuthController(
      JdbcTemplate jdbc,
      JwtService jwtService,
      PasswordService passwordService,
      TokenService tokenService,
      DevMailer mailer,
      @Value("${app.invite.ttl-hours:48}") int inviteTtlHours,
      @Value("${app.reset.ttl-minutes:30}") int resetTtlMinutes,
      @Value("${app.verification.ttl-hours:24}") int verificationTtlHours) {
    this.jdbc = jdbc;
    this.jwtService = jwtService;
    this.passwordService = passwordService;
    this.tokenService = tokenService;
    this.mailer = mailer;
    this.inviteTtlHours = inviteTtlHours;
    this.resetTtlMinutes = resetTtlMinutes;
    this.verificationTtlHours = verificationTtlHours;
  }

  @PostMapping({"/internal/dev/seed","/api/auth/dev/seed"})
  public Map<String, Object> seed(HttpServletRequest req) throws Exception {
    jwtService.ensureSigningKey();
    UUID orgId = ensureOrg("demo", "Demo Org");
    var existing = findUserByEmail("admin@demo.local");
    if (existing == null) {
      UUID userId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO auth.users(id, org_id, username, email, display_name, password_hash, role, status, email_verified_at) VALUES (?,?,?,?,?,?,?,?,now())",
          userId,
          orgId,
          "admin",
          "admin@demo.local",
          "Demo Admin",
          passwordService.hash("Admin123!demo"),
          "ADMIN",
          "ACTIVE");
      ensureMembership(userId, orgId, "ADMIN", "ACTIVE");
      audit(null, orgId, "seed_admin_created", userId, requestId(req), Map.of("email", "admin@demo.local"));
    }
    return Map.of("status", "ok", "orgKey", "demo", "email", "admin@demo.local", "password", "Admin123!demo");
  }

  @PostMapping("/api/auth/login")
  public Map<String, Object> login(@RequestBody LoginRequest body, HttpServletRequest req) throws Exception {
    String email = normalizeEmail(body.email());
    UserRecord user = findUserByEmail(email);
    if (user == null || !passwordService.matches(body.password(), user.passwordHash())) {
      audit(null, null, "login_failed", user == null ? null : user.userId(), requestId(req), Map.of("email", email));
      throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid credentials");
    }
    if (!"ACTIVE".equals(user.userStatus())) {
      audit(user.userId(), user.orgId(), "login_failed", user.userId(), requestId(req), Map.of("reason", "disabled"));
      throw new ApiException(HttpStatus.FORBIDDEN, "AUTH_DISABLED", "User is disabled");
    }
    if (!"ACTIVE".equals(user.membershipStatus())) {
      audit(user.userId(), user.orgId(), "login_failed", user.userId(), requestId(req), Map.of("reason", "membership_inactive"));
      throw new ApiException(HttpStatus.FORBIDDEN, "AUTH_MEMBERSHIP_INACTIVE", "Membership is inactive");
    }
    if (user.emailVerifiedAt() == null) {
      audit(user.userId(), user.orgId(), "login_failed", user.userId(), requestId(req), Map.of("reason", "email_unverified"));
      throw new ApiException(HttpStatus.FORBIDDEN, "AUTH_EMAIL_UNVERIFIED", "Email verification required");
    }

    jdbc.update("UPDATE auth.users SET last_login_at=now(), updated_at=now() WHERE id=?", user.userId());
    String token = jwtService.sign(claimsFor(user));
    audit(user.userId(), user.orgId(), "login_success", user.userId(), requestId(req), Map.of("email", user.email()));
    return Map.of("access_token", token, "token_type", "Bearer", "request_id", requestId(req));
  }

  @PostMapping("/api/auth/logout")
  public Map<String, Object> logout(HttpServletRequest req, @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) throws Exception {
    AuthContext actor = requireAuth(authorization);
    audit(actor.userId(), actor.orgId(), "logout", actor.userId(), requestId(req), Map.of());
    return Map.of("ok", true, "request_id", requestId(req));
  }

  @GetMapping("/api/auth/me")
  public Map<String, Object> me(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) throws Exception {
    AuthContext actor = requireAuth(authorization);
    UserRecord user = getMembership(actor.userId(), actor.orgId());
    return Map.of(
        "request_id", "auth-me",
        "user", Map.of(
            "id", user.userId(),
            "email", user.email(),
            "name", user.displayName(),
            "role", user.role(),
            "orgId", user.orgId(),
            "orgKey", user.orgKey(),
            "orgName", user.orgName(),
            "status", user.userStatus(),
            "emailVerifiedAt", user.emailVerifiedAt()));
  }

  @PostMapping("/api/auth/register-invite")
  public Map<String, Object> registerInvite(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @RequestBody InviteRequest body, HttpServletRequest req) throws Exception {
    AuthContext actor = requireAdmin(authorization, body.orgId());
    String email = normalizeEmail(body.email());
    UserRecord existing = findUserByEmail(email);
    UUID userId = existing == null ? UUID.randomUUID() : existing.userId();
    if (existing == null) {
      jdbc.update(
          "INSERT INTO auth.users(id, org_id, username, email, display_name, password_hash, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'INVITE_CREATED',now(),now())",
          userId,
          body.orgId(),
          email,
          email,
          safeDisplayName(body.displayName(), email),
          "",
          body.role());
    } else {
      jdbc.update(
          "UPDATE auth.users SET display_name=?, role=?, status='INVITE_CREATED', updated_at=now(), org_id=? WHERE id=?",
          safeDisplayName(body.displayName(), email),
          body.role(),
          body.orgId(),
          userId);
    }

    ensureMembership(userId, body.orgId(), body.role(), "INVITE_CREATED");
    audit(actor.userId(), body.orgId(), "invite_created", userId, requestId(req), Map.of("email", email, "role", body.role()));
    return createAndSendInvite(actor, req, userId, body.orgId(), email, body.role(), false);
  }

  @PostMapping("/api/auth/orgs/{orgId}/users/{userId}/resend-invite")
  public Map<String, Object> resendInvite(
      @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
      @PathVariable UUID orgId,
      @PathVariable UUID userId,
      HttpServletRequest req) throws Exception {
    AuthContext actor = requireAdmin(authorization, orgId);
    UserRecord user = getMembership(userId, orgId);
    if ("ACTIVE".equals(user.userStatus()) && "ACTIVE".equals(user.membershipStatus())) {
      throw new ApiException(HttpStatus.CONFLICT, "INVITE_ALREADY_ACCEPTED", "User already accepted the invite");
    }
    audit(actor.userId(), orgId, "invite_resend_requested", userId, requestId(req), Map.of("email", user.email(), "role", user.role()));
    return createAndSendInvite(actor, req, userId, orgId, user.email(), user.role(), true);
  }

  @PostMapping("/api/auth/accept-invite")
  public Map<String, Object> acceptInvite(@RequestBody AcceptInviteRequest body, HttpServletRequest req) {
    String tokenHash = tokenService.hash(body.token());
    var rows = jdbc.query(
        """
        SELECT it.user_id, it.org_id, it.email, it.role, it.expires_at, u.display_name
        FROM auth.invite_tokens it
        JOIN auth.users u ON u.id = it.user_id
        WHERE it.token_hash=? AND it.accepted_at IS NULL AND it.revoked_at IS NULL
        """,
        inviteRowMapper(),
        tokenHash);
    if (rows.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVITE_INVALID", "Invite token is invalid");
    InviteRecord invite = rows.get(0);
    if (invite.expiresAt().isBefore(Instant.now())) {
      markInviteExpired(invite.userId(), invite.orgId(), tokenHash);
      audit(invite.userId(), invite.orgId(), "invite_expired", invite.userId(), requestId(req), Map.of("email", invite.email()));
      throw new ApiException(HttpStatus.BAD_REQUEST, "INVITE_EXPIRED", "Invite token has expired");
    }

    String passwordHash = passwordService.hash(body.password());
    jdbc.update(
        "UPDATE auth.users SET password_hash=?, display_name=?, status='ACTIVE', email_verified_at=now(), updated_at=now(), org_id=? WHERE id=?",
        passwordHash,
        safeDisplayName(body.displayName(), invite.email()),
        invite.orgId(),
        invite.userId());
    jdbc.update("UPDATE auth.memberships SET role=?, status='ACTIVE', updated_at=now() WHERE user_id=? AND org_id=?", invite.role(), invite.userId(), invite.orgId());
    jdbc.update("UPDATE auth.invite_tokens SET accepted_at=now(), delivery_status='ACCEPTED' WHERE token_hash=?", tokenHash);
    audit(invite.userId(), invite.orgId(), "invite_accepted", invite.userId(), requestId(req), Map.of("email", invite.email()));
    return Map.of("ok", true, "email", invite.email(), "message", "Your account is active. Redirecting to sign in...", "request_id", requestId(req));
  }

  @PostMapping("/api/auth/forgot-password")
  public Map<String, Object> forgotPassword(@RequestBody ForgotPasswordRequest body, HttpServletRequest req) {
    String email = normalizeEmail(body.email());
    UserRecord user = findUserByEmail(email);
    if (user != null && "ACTIVE".equals(user.userStatus())) {
      String token = tokenService.generateToken();
      jdbc.update("DELETE FROM auth.password_reset_tokens WHERE user_id=? AND consumed_at IS NULL", user.userId());
      jdbc.update(
          "INSERT INTO auth.password_reset_tokens(user_id, token_hash, expires_at) VALUES (?,?,?)",
          user.userId(),
          tokenService.hash(token),
          Timestamp.from(Instant.now().plus(resetTtlMinutes, ChronoUnit.MINUTES)));
      DevMailer.DeliveryResult delivery = mailer.reset(email, token);
      audit(user.userId(), user.orgId(), "password_reset_requested", user.userId(), requestId(req), Map.of("delivery", delivery.mode()));
    }
    return Map.of("ok", true, "request_id", requestId(req));
  }

  @PostMapping("/api/auth/reset-password")
  public Map<String, Object> resetPassword(@RequestBody ResetPasswordRequest body, HttpServletRequest req) {
    String tokenHash = tokenService.hash(body.token());
    List<Map<String, Object>> rows = jdbc.queryForList(
        "SELECT user_id, expires_at, consumed_at FROM auth.password_reset_tokens WHERE token_hash=?",
        tokenHash);
    if (rows.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "RESET_INVALID", "Reset token is invalid");
    Instant expiresAt = ((Timestamp) rows.get(0).get("expires_at")).toInstant();
    Timestamp consumedAt = (Timestamp) rows.get(0).get("consumed_at");
    if (consumedAt != null || expiresAt.isBefore(Instant.now())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "RESET_EXPIRED", "Reset token has expired");
    }
    UUID userId = (UUID) rows.get(0).get("user_id");
    String passwordHash = passwordService.hash(body.password());
    jdbc.update("UPDATE auth.users SET password_hash=?, updated_at=now() WHERE id=?", passwordHash, userId);
    jdbc.update("UPDATE auth.password_reset_tokens SET consumed_at=now() WHERE token_hash=?", tokenHash);
    Map<String, Object> auditTarget = jdbc.queryForMap("SELECT org_id FROM auth.users WHERE id=?", userId);
    audit(userId, (UUID) auditTarget.get("org_id"), "password_reset_completed", userId, requestId(req), Map.of());
    return Map.of("ok", true, "request_id", requestId(req));
  }

  @GetMapping("/api/auth/verify-email")
  public Map<String, Object> verifyEmail(@RequestParam("token") String token, HttpServletRequest req) {
    String tokenHash = tokenService.hash(token);
    List<Map<String, Object>> rows = jdbc.queryForList(
        "SELECT user_id, expires_at, consumed_at FROM auth.email_verification_tokens WHERE token_hash=?",
        tokenHash);
    if (rows.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "VERIFY_INVALID", "Verification token is invalid");
    Instant expiresAt = ((Timestamp) rows.get(0).get("expires_at")).toInstant();
    Timestamp consumedAt = (Timestamp) rows.get(0).get("consumed_at");
    if (consumedAt != null || expiresAt.isBefore(Instant.now())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "VERIFY_EXPIRED", "Verification token has expired");
    }
    UUID userId = (UUID) rows.get(0).get("user_id");
    jdbc.update("UPDATE auth.users SET email_verified_at=now(), updated_at=now() WHERE id=?", userId);
    jdbc.update("UPDATE auth.email_verification_tokens SET consumed_at=now() WHERE token_hash=?", tokenHash);
    Map<String, Object> auditTarget = jdbc.queryForMap("SELECT org_id FROM auth.users WHERE id=?", userId);
    audit(userId, (UUID) auditTarget.get("org_id"), "email_verified", userId, requestId(req), Map.of());
    return Map.of("ok", true, "service", "auth", "request_id", requestId(req));
  }

  @PostMapping("/api/auth/resend-verification")
  public Map<String, Object> resendVerification(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, HttpServletRequest req) throws Exception {
    AuthContext actor = requireAuth(authorization);
    UserRecord user = getMembership(actor.userId(), actor.orgId());
    if (user.emailVerifiedAt() != null) {
      return Map.of("ok", true, "already_verified", true, "request_id", requestId(req));
    }
    String token = tokenService.generateToken();
    jdbc.update("DELETE FROM auth.email_verification_tokens WHERE user_id=? AND consumed_at IS NULL", user.userId());
    jdbc.update(
        "INSERT INTO auth.email_verification_tokens(user_id, token_hash, expires_at) VALUES (?,?,?)",
        user.userId(),
        tokenService.hash(token),
        Timestamp.from(Instant.now().plus(verificationTtlHours, ChronoUnit.HOURS)));
    DevMailer.DeliveryResult delivery = mailer.verify(user.email(), token);
    audit(user.userId(), user.orgId(), "verification_resent", user.userId(), requestId(req), Map.of("delivery", delivery.mode()));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("delivery", delivery.mode());
    if (delivery.preview() && delivery.link() != null) {
      response.put("dev_link", delivery.link());
    }
    response.put("request_id", requestId(req));
    return response;
  }

  @GetMapping("/api/auth/orgs")
  public Map<String, Object> orgs(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) throws Exception {
    AuthContext actor = requireAuth(authorization);
    List<Map<String, Object>> orgs = jdbc.queryForList(
        """
        SELECT o.id, COALESCE(o.display_name, o.org_key) AS name, o.org_key
        FROM auth.memberships m
        JOIN auth.organizations o ON o.id = m.org_id
        WHERE m.user_id=? AND m.status='ACTIVE'
        ORDER BY name
        """,
        actor.userId());
    return Map.of("items", orgs, "total", orgs.size(), "request_id", "auth-orgs");
  }

  @GetMapping("/api/auth/orgs/{orgId}/users")
  public Map<String, Object> users(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID orgId) throws Exception {
    requireAdmin(authorization, orgId);
    List<Map<String, Object>> users = jdbc.queryForList(
        """
        SELECT u.id, u.email, u.display_name AS name, m.role, m.status, u.created_at, u.last_login_at
        FROM auth.memberships m
        JOIN auth.users u ON u.id = m.user_id
        WHERE m.org_id=?
        ORDER BY lower(u.email)
        """,
        orgId);
    return Map.of("items", users, "total", users.size(), "request_id", "auth-users");
  }

  @PatchMapping("/api/auth/orgs/{orgId}/users/{userId}/role")
  public Map<String, Object> updateRole(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID orgId, @PathVariable UUID userId, @RequestBody UpdateRoleRequest body, HttpServletRequest req) throws Exception {
    AuthContext actor = requireAdmin(authorization, orgId);
    Map<String, Object> before = jdbc.queryForMap("SELECT role, status FROM auth.memberships WHERE org_id=? AND user_id=?", orgId, userId);
    jdbc.update("UPDATE auth.memberships SET role=?, updated_at=now() WHERE org_id=? AND user_id=?", body.role(), orgId, userId);
    jdbc.update("UPDATE auth.users SET role=?, updated_at=now() WHERE id=?", body.role(), userId);
    Map<String, Object> after = jdbc.queryForMap("SELECT role, status FROM auth.memberships WHERE org_id=? AND user_id=?", orgId, userId);
    audit(actor.userId(), orgId, "role_changed", userId, requestId(req), Map.of("before", before, "after", after));
    return Map.of("ok", true, "request_id", requestId(req));
  }

  @PatchMapping("/api/auth/orgs/{orgId}/users/{userId}/status")
  public Map<String, Object> updateStatus(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID orgId, @PathVariable UUID userId, @RequestBody UpdateStatusRequest body, HttpServletRequest req) throws Exception {
    AuthContext actor = requireAdmin(authorization, orgId);
    String membershipStatus = "DISABLED".equalsIgnoreCase(body.status()) ? "DISABLED" : "ACTIVE";
    String userStatus = "DISABLED".equalsIgnoreCase(body.status()) ? "DISABLED" : "ACTIVE";
    Map<String, Object> before = jdbc.queryForMap("SELECT role, status FROM auth.memberships WHERE org_id=? AND user_id=?", orgId, userId);
    jdbc.update("UPDATE auth.memberships SET status=?, updated_at=now() WHERE org_id=? AND user_id=?", membershipStatus, orgId, userId);
    jdbc.update("UPDATE auth.users SET status=?, updated_at=now() WHERE id=?", userStatus, userId);
    Map<String, Object> after = jdbc.queryForMap("SELECT role, status FROM auth.memberships WHERE org_id=? AND user_id=?", orgId, userId);
    audit(actor.userId(), orgId, "user_status_changed", userId, requestId(req), Map.of("before", before, "after", after));
    return Map.of("ok", true, "request_id", requestId(req));
  }

  @GetMapping("/.well-known/jwks.json")
  public Map<String, Object> jwks() throws Exception {
    return jwtService.jwks();
  }

  private AuthContext requireAuth(String authorization) throws Exception {
    if (authorization == null || !authorization.startsWith("Bearer ")) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Not authenticated");
    }
    JWTClaimsSet claims;
    try {
      claims = jwtService.verify(authorization.substring("Bearer ".length()));
    } catch (ApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid token");
    }
    return new AuthContext(UUID.fromString(claims.getStringClaim("userId")), UUID.fromString(claims.getStringClaim("orgId")), claims.getStringClaim("role"), claims.getStringClaim("email"));
  }

  private AuthContext requireAdmin(String authorization, UUID orgId) throws Exception {
    AuthContext actor = requireAuth(authorization);
    if (!orgId.equals(actor.orgId()) || !"ADMIN".equals(actor.role())) {
      throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", "Admin access required");
    }
    return actor;
  }

  private UUID ensureOrg(String orgKey, String displayName) {
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT id FROM auth.organizations WHERE org_key=?", orgKey);
    if (!rows.isEmpty()) return (UUID) rows.get(0).get("id");
    UUID orgId = UUID.randomUUID();
    jdbc.update("INSERT INTO auth.organizations(id, org_key, display_name) VALUES (?,?,?)", orgId, orgKey, displayName);
    return orgId;
  }

  private void ensureMembership(UUID userId, UUID orgId, String role, String status) {
    jdbc.update(
        """
        INSERT INTO auth.memberships(user_id, org_id, role, status)
        VALUES (?,?,?,?)
        ON CONFLICT (user_id, org_id) DO UPDATE SET role=EXCLUDED.role, status=EXCLUDED.status, updated_at=now()
        """,
        userId, orgId, role, status);
  }

  private Map<String, Object> createAndSendInvite(AuthContext actor, HttpServletRequest req, UUID userId, UUID orgId, String email, String role, boolean resend) {
    String token = tokenService.generateToken();
    jdbc.update(
        "UPDATE auth.invite_tokens SET revoked_at=now(), delivery_status=CASE WHEN delivery_status='ACCEPTED' THEN delivery_status ELSE 'REVOKED' END WHERE user_id=? AND accepted_at IS NULL AND revoked_at IS NULL",
        userId);
    jdbc.update(
        "INSERT INTO auth.invite_tokens(user_id, org_id, email, role, token_hash, expires_at, created_by_user_id, delivery_status) VALUES (?,?,?,?,?,?,?,?)",
        userId,
        orgId,
        email,
        role,
        tokenService.hash(token),
        Timestamp.from(Instant.now().plus(inviteTtlHours, ChronoUnit.HOURS)),
        actor.userId(),
        "CREATED");

    DevMailer.DeliveryResult delivery = mailer.invite(email, token);
    if (delivery.success()) {
      jdbc.update("UPDATE auth.users SET status='INVITE_SENT', updated_at=now(), org_id=? WHERE id=?", orgId, userId);
      jdbc.update("UPDATE auth.memberships SET role=?, status='INVITE_SENT', updated_at=now() WHERE user_id=? AND org_id=?", role, userId, orgId);
      jdbc.update(
          "UPDATE auth.invite_tokens SET delivery_status='SENT', last_delivery_attempt_at=now(), sent_at=now(), delivery_error=NULL WHERE token_hash=?",
          tokenService.hash(token));
      audit(actor.userId(), orgId, resend ? "invite_resent" : "invite_sent", userId, requestId(req), Map.of("email", email, "role", role, "delivery", delivery.mode()));
      Map<String, Object> response = new LinkedHashMap<>();
      response.put("ok", true);
      response.put("user_id", userId);
      response.put("status", "INVITE_SENT");
      response.put("delivery", delivery.mode());
      if (delivery.preview() && delivery.link() != null) {
        response.put("dev_link", delivery.link());
      }
      if (delivery.mailboxUrl() != null && !delivery.mailboxUrl().isBlank()) {
        response.put("mailbox_url", delivery.mailboxUrl());
      }
      response.put("request_id", requestId(req));
      return response;
    }

    jdbc.update("UPDATE auth.users SET status='INVITE_DELIVERY_FAILED', updated_at=now(), org_id=? WHERE id=?", orgId, userId);
    jdbc.update("UPDATE auth.memberships SET role=?, status='INVITE_DELIVERY_FAILED', updated_at=now() WHERE user_id=? AND org_id=?", role, userId, orgId);
    jdbc.update(
        "UPDATE auth.invite_tokens SET delivery_status='FAILED', last_delivery_attempt_at=now(), delivery_error=? WHERE token_hash=?",
        delivery.error(),
        tokenService.hash(token));
    audit(actor.userId(), orgId, "invite_delivery_failed", userId, requestId(req), Map.of("email", email, "role", role, "delivery", delivery.mode(), "error", delivery.error()));
    throw new ApiException(HttpStatus.BAD_GATEWAY, "INVITE_DELIVERY_FAILED", "Invite email could not be delivered");
  }

  private void markInviteExpired(UUID userId, UUID orgId, String tokenHash) {
    jdbc.update("UPDATE auth.users SET status='EXPIRED', updated_at=now() WHERE id=? AND status IN ('INVITE_CREATED','INVITE_SENT','INVITE_DELIVERY_FAILED')", userId);
    jdbc.update("UPDATE auth.memberships SET status='EXPIRED', updated_at=now() WHERE user_id=? AND org_id=? AND status IN ('INVITE_CREATED','INVITE_SENT','INVITE_DELIVERY_FAILED')", userId, orgId);
    jdbc.update("UPDATE auth.invite_tokens SET delivery_status='EXPIRED' WHERE token_hash=?", tokenHash);
  }

  private UserRecord findUserByEmail(String email) {
    List<UserRecord> rows = jdbc.query(
        """
        SELECT u.id AS user_id, u.email, u.display_name, u.password_hash, u.status AS user_status, u.email_verified_at,
               m.org_id, o.org_key, COALESCE(o.display_name, o.org_key) AS org_name, m.role, m.status AS membership_status
        FROM auth.users u
        LEFT JOIN auth.memberships m ON m.user_id = u.id
        LEFT JOIN auth.organizations o ON o.id = m.org_id
        WHERE lower(u.email)=?
        ORDER BY m.created_at ASC
        LIMIT 1
        """,
        userRowMapper(),
        email);
    return rows.isEmpty() ? null : rows.get(0);
  }

  private UserRecord getMembership(UUID userId, UUID orgId) {
    List<UserRecord> rows = jdbc.query(
        """
        SELECT u.id AS user_id, u.email, u.display_name, u.password_hash, u.status AS user_status, u.email_verified_at,
               m.org_id, o.org_key, COALESCE(o.display_name, o.org_key) AS org_name, m.role, m.status AS membership_status
        FROM auth.users u
        JOIN auth.memberships m ON m.user_id = u.id
        JOIN auth.organizations o ON o.id = m.org_id
        WHERE u.id=? AND m.org_id=?
        LIMIT 1
        """,
        userRowMapper(),
        userId, orgId);
    if (rows.isEmpty()) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Membership not found");
    return rows.get(0);
  }

  private Map<String, Object> claimsFor(UserRecord user) {
    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("userId", user.userId().toString());
    claims.put("email", user.email());
    claims.put("displayName", user.displayName());
    claims.put("orgId", user.orgId().toString());
    claims.put("orgKey", user.orgKey());
    claims.put("orgName", user.orgName());
    claims.put("role", user.role());
    claims.put("status", user.userStatus());
    claims.put("emailVerifiedAt", user.emailVerifiedAt() == null ? null : user.emailVerifiedAt().toString());
    return claims;
  }

  private void audit(UUID actorUserId, UUID orgId, String eventType, UUID targetUserId, String requestId, Map<String, Object> metadata) {
    jdbc.update(
        "INSERT INTO auth.auth_audit_events(actor_user_id, org_id, event_type, target_user_id, request_id, metadata_json) VALUES (?,?,?,?,?, cast(? as jsonb))",
        actorUserId, orgId, eventType, targetUserId, requestId, json(metadata));
  }

  private String json(Map<String, Object> values) {
    StringBuilder builder = new StringBuilder("{");
    boolean first = true;
    for (Map.Entry<String, Object> entry : values.entrySet()) {
      if (!first) builder.append(',');
      first = false;
      builder.append('"').append(entry.getKey().replace("\"", "\\\"")).append('"').append(':');
      Object value = entry.getValue();
      if (value == null) {
        builder.append("null");
      } else {
        builder.append('"').append(String.valueOf(value).replace("\"", "\\\"")).append('"');
      }
    }
    builder.append('}');
    return builder.toString();
  }

  private String requestId(HttpServletRequest req) {
    return String.valueOf(req.getAttribute("request_id"));
  }

  private String normalizeEmail(String email) {
    if (email == null) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", "Email is required");
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    if (!normalized.contains("@")) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", "Email is invalid");
    return normalized;
  }

  private String safeDisplayName(String displayName, String email) {
    String fallback = email.substring(0, email.indexOf('@'));
    if (displayName == null || displayName.isBlank()) return fallback;
    return displayName.trim();
  }

  private RowMapper<UserRecord> userRowMapper() {
    return (rs, rowNum) -> new UserRecord(
        (UUID) rs.getObject("user_id"),
        rs.getString("email"),
        rs.getString("display_name"),
        rs.getString("password_hash"),
        rs.getString("user_status"),
        rs.getTimestamp("email_verified_at") == null ? null : rs.getTimestamp("email_verified_at").toInstant(),
        (UUID) rs.getObject("org_id"),
        rs.getString("org_key"),
        rs.getString("org_name"),
        rs.getString("role"),
        rs.getString("membership_status"));
  }

  private RowMapper<InviteRecord> inviteRowMapper() {
    return (rs, rowNum) -> new InviteRecord(
        (UUID) rs.getObject("user_id"),
        (UUID) rs.getObject("org_id"),
        rs.getString("email"),
        rs.getString("role"),
        rs.getTimestamp("expires_at").toInstant());
  }

  private record AuthContext(UUID userId, UUID orgId, String role, String email) {}

  private record UserRecord(
      UUID userId,
      String email,
      String displayName,
      String passwordHash,
      String userStatus,
      Instant emailVerifiedAt,
      UUID orgId,
      String orgKey,
      String orgName,
      String role,
      String membershipStatus) {}

  private record InviteRecord(UUID userId, UUID orgId, String email, String role, Instant expiresAt) {}

  public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
  public record InviteRequest(UUID orgId, @NotBlank @Email String email, String displayName, @NotBlank String role) {}
  public record AcceptInviteRequest(@NotBlank String token, String displayName, @NotBlank String password) {}
  public record ForgotPasswordRequest(@NotBlank @Email String email) {}
  public record ResetPasswordRequest(@NotBlank String token, @NotBlank String password) {}
  public record UpdateRoleRequest(@NotBlank String role) {}
  public record UpdateStatusRequest(@NotBlank String status) {}
}
