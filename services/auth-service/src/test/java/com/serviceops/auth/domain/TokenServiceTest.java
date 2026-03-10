package com.serviceops.auth.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;

class TokenServiceTest {
  private final TokenService tokenService = new TokenService();

  @Test
  void generatedTokensAreNonEmpty() {
    String token = tokenService.generateToken();
    assertNotNull(token);
    assertNotEquals("", token);
  }

  @Test
  void tokenHashIsDeterministic() {
    String token = tokenService.generateToken();
    assertEquals(tokenService.hash(token), tokenService.hash(token));
  }

  @Test
  void tokenHashesDifferForDifferentTokens() {
    assertNotEquals(tokenService.hash(tokenService.generateToken()), tokenService.hash(tokenService.generateToken()));
  }
}
