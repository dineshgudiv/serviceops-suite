package com.serviceops.auth.domain;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class DevMailer {
  private static final Logger log = LoggerFactory.getLogger(DevMailer.class);

  private final boolean devMode;
  private final String baseUrl;
  private final String from;
  private final String mailboxUrl;
  private final JavaMailSender mailSender;

  public DevMailer(
      JavaMailSender mailSender,
      @Value("${app.mail.dev-mode:true}") boolean devMode,
      @Value("${app.mail.base-url:http://localhost:3000}") String baseUrl,
      @Value("${app.mail.from:no-reply@serviceops.local}") String from,
      @Value("${app.mail.mailbox-url:}") String mailboxUrl) {
    this.mailSender = mailSender;
    this.devMode = devMode;
    this.baseUrl = trimTrailingSlash(baseUrl);
    this.from = from;
    this.mailboxUrl = mailboxUrl == null ? "" : mailboxUrl.trim();
  }

  public DeliveryResult invite(String email, String token) {
    String link = baseUrl + "/accept-invite?token=" + token;
    return emit("invite", email, "You're invited to ServiceOps Suite", link,
        """
        <p>You have been invited to ServiceOps Suite.</p>
        <p><a href="%s" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;">Accept invite</a></p>
        <p>This invite expires in 48 hours.</p>
        <p>If the button does not work, use this link:</p>
        <p>%s</p>
        """.formatted(link, link),
        """
        You have been invited to ServiceOps Suite.

        Accept invite: %s

        This invite expires in 48 hours.
        """.formatted(link));
  }

  public DeliveryResult reset(String email, String token) {
    String link = baseUrl + "/reset-password?token=" + token;
    return emit("password-reset", email, "Reset your ServiceOps password", link,
        """
        <p>A password reset was requested for your ServiceOps account.</p>
        <p><a href="%s" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a></p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>%s</p>
        """.formatted(link, link),
        """
        A password reset was requested for your ServiceOps account.

        Reset password: %s
        """.formatted(link));
  }

  public DeliveryResult verify(String email, String token) {
    String link = baseUrl + "/verify-email?token=" + token;
    return emit("email-verification", email, "Verify your ServiceOps email", link,
        """
        <p>Verify your email address to continue using ServiceOps.</p>
        <p><a href="%s" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;">Verify email</a></p>
        <p>%s</p>
        """.formatted(link, link),
        """
        Verify your email address to continue using ServiceOps.

        Verify email: %s
        """.formatted(link));
  }

  private DeliveryResult emit(String kind, String email, String subject, String link, String htmlBody, String textBody) {
    if (devMode) {
      log.info("DEV_MAIL kind={} email={} link={}", kind, email, link);
      return new DeliveryResult("log", true, link, true, mailboxUrl, null);
    }

    try {
      MimeMessage message = mailSender.createMimeMessage();
      MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
      helper.setFrom(from);
      helper.setTo(email);
      helper.setSubject(subject);
      helper.setText(textBody, htmlBody);
      mailSender.send(message);
      log.info("MAIL_SENT kind={} email={} provider=smtp", kind, email);
      return new DeliveryResult("smtp", false, null, true, mailboxUrl, null);
    } catch (Exception ex) {
      log.error("MAIL_SEND_FAILED kind={} email={} reason={}", kind, email, safeReason(ex), ex);
      return new DeliveryResult("smtp", false, null, false, mailboxUrl, safeReason(ex));
    }
  }

  private String safeReason(Exception ex) {
    String message = ex.getMessage();
    if (message == null || message.isBlank()) return ex.getClass().getSimpleName();
    return ex.getClass().getSimpleName() + ": " + message;
  }

  private String trimTrailingSlash(String value) {
    if (value == null || value.isBlank()) return "http://localhost:3000";
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  public record DeliveryResult(String mode, boolean preview, String link, boolean success, String mailboxUrl, String error) {}
}
