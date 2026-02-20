<?php
namespace bobmitch\bar\Helpers;

class CSRF {

    const TOKEN_KEY = 'csrf_token';
    const HEADER_NAME = 'X-CSRF-Token';

    /**
     * Get the current session CSRF token, generating one if it doesn't exist.
     */
    public static function getToken(): string {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (empty($_SESSION[self::TOKEN_KEY])) {
            $_SESSION[self::TOKEN_KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::TOKEN_KEY];
    }

    /**
     * Validate the token from the request header against the session token.
     * Returns true if valid, false otherwise.
     */
    public static function validate(): bool {
        $headerKey = 'HTTP_' . strtoupper(str_replace('-', '_', self::HEADER_NAME));
        $requestToken = $_SERVER[$headerKey] ?? '';
        $sessionToken = $_SESSION[self::TOKEN_KEY] ?? '';

        if (empty($requestToken) || empty($sessionToken)) {
            return false;
        }
        // Timing-safe comparison
        return hash_equals($sessionToken, $requestToken);
    }
}