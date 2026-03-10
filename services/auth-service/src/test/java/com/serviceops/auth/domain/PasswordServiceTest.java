package com.serviceops.auth.domain;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.serviceops.auth.api.ApiException;
import org.junit.jupiter.api.Test;

class PasswordServiceTest {
  private final PasswordService passwordService = new PasswordService(12);

  @Test
  void hashesAndMatchesPasswords() {
    String hash = passwordService.hash("StrongPass123!");
    assertTrue(passwordService.matches("StrongPass123!", hash));
    assertFalse(passwordService.matches("WrongPass123!", hash));
  }

  @Test
  void rejectsWeakPasswords() {
    assertThrows(ApiException.class, () -> passwordService.hash("weak"));
  }

  @Test
  void acceptsComplexPasswords() {
    assertDoesNotThrow(() -> passwordService.hash("AnotherGood1!"));
  }
}
