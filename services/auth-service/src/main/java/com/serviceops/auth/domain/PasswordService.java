package com.serviceops.auth.domain;

import com.serviceops.auth.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class PasswordService {
  private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
  private final int minLength;

  public PasswordService(@Value("${app.password.min-length:12}") int minLength) {
    this.minLength = minLength;
  }

  public void validatePolicy(String password) {
    if (password == null || password.length() < minLength) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_POLICY", "Password must be at least " + minLength + " characters");
    }
    boolean hasUpper = password.chars().anyMatch(Character::isUpperCase);
    boolean hasLower = password.chars().anyMatch(Character::isLowerCase);
    boolean hasDigit = password.chars().anyMatch(Character::isDigit);
    boolean hasSymbol = password.chars().anyMatch(ch -> !Character.isLetterOrDigit(ch));
    if (!(hasUpper && hasLower && hasDigit && hasSymbol)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_POLICY", "Password must include upper, lower, number, and symbol");
    }
  }

  public String hash(String password) {
    validatePolicy(password);
    return encoder.encode(password);
  }

  public boolean matches(String rawPassword, String hash) {
    return rawPassword != null && hash != null && encoder.matches(rawPassword, hash);
  }
}
