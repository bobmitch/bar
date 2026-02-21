<?php
namespace bobmitch\bar\Helpers;

/**
 * Call SessionBootstrap::init() as early as possible on every page load
 * (before any widget checks $_SESSION['user_id']).
 *
 * Place a call in your template or CMS bootstrap:
 *   \bobmitch\bar\Helpers\SessionBootstrap::init();
 */
class SessionBootstrap {

    public static function init(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Already have a valid session? Nothing to do.
        if (!empty($_SESSION['user_id'])) {
            return;
        }

        // No session — try remember-me cookie
        $user = RememberMe::attempt();
        if ($user) {
            $_SESSION['user_id']  = $user->id;
            $_SESSION['username'] = $user->username;
            // Regenerate session ID to prevent fixation
            session_regenerate_id(true);
        }
    }
}