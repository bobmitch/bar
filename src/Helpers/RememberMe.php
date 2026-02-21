<?php
namespace bobmitch\bar\Helpers;

use HoltBosse\DB\DB;

/**
 * Secure "Keep Me Logged In" implementation.
 *
 * Uses the split-token pattern:
 *  - A random `selector` (24 chars) identifies the DB row — safe to expose in cookie.
 *  - A random `token` (32 bytes) is stored HASHED in DB — never stored in plain text.
 *  - Cookie value: selector:token (base64url encoded together as selector.rawtoken).
 *
 * Expiry: 21 days. Tokens are single-use on validation (rotated).
 */
class RememberMe {

    const COOKIE_NAME   = 'bar_rm';
    const MAX_DAYS      = 21;
    const COOKIE_PATH   = '/';

    // ---------------------------------------------------------------
    // PUBLIC API
    // ---------------------------------------------------------------

    /**
     * Issue a remember-me cookie and store the hashed token in DB.
     * Call this immediately after a successful login when checkbox is ticked.
     */
    public static function issue(int $userId): void {
        $selector  = bin2hex(random_bytes(12));          // 24 hex chars
        $rawToken  = random_bytes(32);
        $tokenHash = hash('sha256', $rawToken);
        $expires   = date('Y-m-d H:i:s', strtotime('+' . self::MAX_DAYS . ' days'));

        // Clean up any old tokens for this user first (optional, keeps table lean)
        DB::exec(
            'DELETE FROM remember_tokens WHERE user_id = ? AND expires < NOW()',
            [$userId]
        );

        DB::exec(
            'INSERT INTO remember_tokens (user_id, selector, token_hash, expires) VALUES (?, ?, ?, ?)',
            [$userId, $selector, $tokenHash, $expires]
        );

        $cookieValue = $selector . ':' . base64_encode($rawToken);
        self::setCookie($cookieValue, strtotime('+' . self::MAX_DAYS . ' days'));
    }

    /**
     * Try to log in from a remember-me cookie.
     * Returns the user row (object) on success, or null on failure.
     * Rotates the token on success (old token destroyed, new one issued).
     */
    public static function attempt(): ?object {
        $cookieValue = $_COOKIE[self::COOKIE_NAME] ?? '';
        if (!$cookieValue) return null;

        [$selector, $rawTokenB64] = array_pad(explode(':', $cookieValue, 2), 2, '');

        if (!$selector || !$rawTokenB64) {
            self::clear();
            return null;
        }

        $rawToken = base64_decode($rawTokenB64, true);
        if ($rawToken === false) {
            self::clear();
            return null;
        }

        // Look up by selector
        $record = DB::fetch(
            'SELECT * FROM remember_tokens WHERE selector = ? AND expires > NOW()',
            [$selector]
        );

        if (!$record) {
            self::clear();
            return null;
        }

        // Timing-safe token comparison
        $expectedHash = hash('sha256', $rawToken);
        if (!hash_equals($record->token_hash, $expectedHash)) {
            // Possible theft — invalidate ALL tokens for this user
            DB::exec('DELETE FROM remember_tokens WHERE user_id = ?', [$record->user_id]);
            self::clear();
            return null;
        }

        // Token valid — fetch user
        $user = DB::fetch(
            'SELECT * FROM users WHERE id = ? AND state = 1',
            [$record->user_id]
        );

        if (!$user) {
            DB::exec('DELETE FROM remember_tokens WHERE id = ?', [$record->id]);
            self::clear();
            return null;
        }

        // Rotate: delete old token, issue fresh one
        DB::exec('DELETE FROM remember_tokens WHERE id = ?', [$record->id]);
        self::issue($user->id);

        return $user;
    }

    /**
     * Revoke the current remember-me cookie and its DB record.
     * Call on logout.
     */
    public static function revoke(): void {
        $cookieValue = $_COOKIE[self::COOKIE_NAME] ?? '';
        if ($cookieValue) {
            [$selector] = explode(':', $cookieValue, 2);
            if ($selector) {
                DB::exec('DELETE FROM remember_tokens WHERE selector = ?', [$selector]);
            }
        }
        self::clear();
    }

    /**
     * Revoke ALL remember-me tokens for a user (e.g. password change, security event).
     */
    public static function revokeAll(int $userId): void {
        DB::exec('DELETE FROM remember_tokens WHERE user_id = ?', [$userId]);
        self::clear();
    }

    // ---------------------------------------------------------------
    // PRIVATE HELPERS
    // ---------------------------------------------------------------

    private static function setCookie(string $value, int $expiry): void {
        setcookie(self::COOKIE_NAME, $value, [
            'expires'  => $expiry,
            'path'     => self::COOKIE_PATH,
            'secure'   => true,       // HTTPS only — set false if local dev without SSL
            'httponly' => true,       // Not accessible to JS
            'samesite' => 'Lax',
        ]);
    }

    private static function clear(): void {
        setcookie(self::COOKIE_NAME, '', [
            'expires'  => time() - 3600,
            'path'     => self::COOKIE_PATH,
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        unset($_COOKIE[self::COOKIE_NAME]);
    }
}