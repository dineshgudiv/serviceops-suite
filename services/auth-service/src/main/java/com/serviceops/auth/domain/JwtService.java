package com.serviceops.auth.domain;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class JwtService {
  private final JdbcTemplate jdbc;
  private final String issuer;
  private final long ttlSeconds;

  public JwtService(JdbcTemplate jdbc, @Value("${app.jwt.issuer}") String issuer, @Value("${app.jwt.ttl-seconds:3600}") long ttlSeconds) {
    this.jdbc = jdbc;
    this.issuer = issuer;
    this.ttlSeconds = ttlSeconds;
  }

  public void ensureSigningKey() throws Exception {
    Integer keys = jdbc.queryForObject("SELECT count(*) FROM auth.signing_keys WHERE active=true", Integer.class);
    if (keys != null && keys > 0) return;
    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    KeyPair pair = generator.generateKeyPair();
    jdbc.update(
        "INSERT INTO auth.signing_keys(kid,private_pem,public_pem,active) VALUES (?,?,?,true)",
        UUID.randomUUID().toString(),
        pem(pair.getPrivate().getEncoded(), "PRIVATE KEY"),
        pem(pair.getPublic().getEncoded(), "PUBLIC KEY"));
  }

  public String sign(Map<String, Object> claims) throws Exception {
    ensureSigningKey();
    var key = jdbc.queryForMap("SELECT kid, private_pem FROM auth.signing_keys WHERE active=true ORDER BY created_at DESC LIMIT 1");
    String kid = (String) key.get("kid");
    RSAPrivateKey privateKey = (RSAPrivateKey) decodePrivate((String) key.get("private_pem"));
    Instant now = Instant.now();
    JWTClaimsSet set = new JWTClaimsSet.Builder()
        .issuer(issuer)
        .subject(String.valueOf(claims.get("email")))
        .claim("userId", claims.get("userId"))
        .claim("email", claims.get("email"))
        .claim("displayName", claims.get("displayName"))
        .claim("orgId", claims.get("orgId"))
        .claim("orgKey", claims.get("orgKey"))
        .claim("orgName", claims.get("orgName"))
        .claim("role", claims.get("role"))
        .claim("status", claims.get("status"))
        .claim("emailVerifiedAt", claims.get("emailVerifiedAt"))
        .issueTime(Date.from(now))
        .expirationTime(Date.from(now.plusSeconds(ttlSeconds)))
        .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).build(), set);
    try {
      jwt.sign(new RSASSASigner(privateKey));
    } catch (JOSEException ex) {
      throw new RuntimeException(ex);
    }
    return jwt.serialize();
  }

  public JWTClaimsSet verify(String token) throws Exception {
    SignedJWT jwt = SignedJWT.parse(token);
    var key = jdbc.queryForMap("SELECT public_pem FROM auth.signing_keys WHERE kid=?", jwt.getHeader().getKeyID());
    RSAPublicKey publicKey = (RSAPublicKey) decodePublic((String) key.get("public_pem"));
    if (!jwt.verify(new RSASSAVerifier(publicKey))) {
      throw new IllegalArgumentException("Invalid JWT signature");
    }
    JWTClaimsSet claims = jwt.getJWTClaimsSet();
    if (claims.getExpirationTime() == null || claims.getExpirationTime().before(new Date())) {
      throw new IllegalArgumentException("Token expired");
    }
    return claims;
  }

  public Map<String, Object> jwks() throws Exception {
    ensureSigningKey();
    var key = jdbc.queryForMap("SELECT kid, public_pem FROM auth.signing_keys WHERE active=true ORDER BY created_at DESC LIMIT 1");
    RSAPublicKey publicKey = (RSAPublicKey) decodePublic((String) key.get("public_pem"));
    return new JWKSet(new RSAKey.Builder(publicKey).keyID((String) key.get("kid")).build()).toJSONObject();
  }

  private static String pem(byte[] bytes, String type) {
    return "-----BEGIN " + type + "-----\n" + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(bytes) + "\n-----END " + type + "-----";
  }

  private static PrivateKey decodePrivate(String pem) throws Exception {
    String body = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replaceAll("\\s", "");
    return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
  }

  private static PublicKey decodePublic(String pem) throws Exception {
    String body = pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
    return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(body)));
  }
}
