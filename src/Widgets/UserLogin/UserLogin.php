<?php
namespace bobmitch\bar\Widgets\UserLogin;

use HoltBosse\Alba\Core\{CMS, Mail, Widget};
use HoltBosse\DB\DB;
use bobmitch\bar\Helpers\RememberMe;

class UserLogin extends Widget {
    public function render() {
        $message = "";

        // 1. Handle Logout
        if (isset($_GET['action']) && $_GET['action'] === 'logout') {
            RememberMe::revoke();           // Clear persistent cookie + DB token
            session_destroy();
            header("Location: " . strtok($_SERVER["REQUEST_URI"], '?'));
            exit;
        }

        // 2. Already logged in — redirect away
        if (isset($_SESSION['user_id'])) {
            header("Location: /tracker");
            exit;
        }

        // --- Determine which "sub-view" to show ---
        $view = $_GET['view'] ?? 'login'; // 'login' | 'forgot' | 'reset'

        // =====================================================================
        // 3. Handle Password Reset (token link from email)
        // =====================================================================
        if ($view === 'reset') {
            $token = trim($_GET['token'] ?? '');

            if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_reset'])) {
                $token    = trim($_POST['reset_token'] ?? '');
                $newPass  = $_POST['new_password']     ?? '';
                $confirm  = $_POST['confirm_password'] ?? '';

                if (strlen($newPass) < 8) {
                    $message = "<div class='alert error'>Password must be at least 8 characters.</div>";
                } elseif ($newPass !== $confirm) {
                    $message = "<div class='alert error'>Passwords do not match.</div>";
                } else {
                    $user = DB::fetch(
                        "SELECT * FROM users WHERE reset_key = ? AND reset_key_expires > NOW()",
                        [$token]
                    );

                    if ($user) {
                        $hash = password_hash($newPass, PASSWORD_BCRYPT);
                        DB::query(
                            "UPDATE users SET password = ?, reset_key = NULL, reset_key_expires = NULL WHERE id = ?",
                            [$hash, $user->id]
                        );
                        $message = "<div class='alert success'>Password updated! You can now <a href='/login'>sign in</a>.</div>";
                        $view = 'done'; // suppress the form
                    } else {
                        $message = "<div class='alert error'>This reset link is invalid or has expired. Please <a href='/login?view=forgot'>request a new one</a>.</div>";
                        $view = 'done';
                    }
                }
            }

            if ($view !== 'done') {
                // Validate token before showing form
                $tokenValid = DB::fetch(
                    "SELECT id FROM users WHERE reset_key = ? AND reset_key_expires > NOW()",
                    [$token]
                );
                if (!$tokenValid) {
                    $message = "<div class='alert error'>This reset link is invalid or has expired. Please <a href='/login?view=forgot'>request a new one</a>.</div>";
                    $view = 'done';
                }
            }

            $this->_render_styles();
            if ($view === 'done') {
                echo "<div class='login-container'>{$message}</div>";
            } else {
                $this->_render_reset_form($token, $message);
            }
            return;
        }

        // =====================================================================
        // 4. Handle Forgot Password submission
        // =====================================================================
        if ($view === 'forgot') {
            if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_forgot'])) {
                $email = trim(strtolower($_POST['email'] ?? ''));

                // Always show the same message to avoid user enumeration
                $message = "<div class='alert success'>If that email is registered, a reset link has been sent.</div>";

                $user = DB::fetch(
                    "SELECT * FROM users WHERE LOWER(email) = ?",
                    [$email]
                );

                if ($user) {
                    $token   = bin2hex(random_bytes(32));       // 64-char hex token
                    $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

                    DB::query(
                        "UPDATE users SET reset_key = ?, reset_key_expires = ? WHERE id = ?",
                        [$token, $expires, $user->id]
                    );

                    $resetUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'bar.bobmitch.com')
                        . '/login?view=reset&token=' . urlencode($token);

                    $body = "Hi " . htmlspecialchars($user->username) . ",\n\n"
                        . "You requested a password reset for your BAR Tracker account.\n\n"
                        . "Click the link below to reset your password (valid for 1 hour):\n"
                        . $resetUrl . "\n\n"
                        . "If you did not request this, you can safely ignore this email.\n\n"
                        . "— BAR Tracker";

                    Mail::send([
                        'to'      => $user->email,
                        'subject' => 'BAR Tracker — Password Reset',
                        'body'    => $body,
                    ]);
                }
            }

            $this->_render_styles();
            $this->_render_forgot_form($message);
            return;
        }

        // =====================================================================
        // 5. Handle Login Submission
        // =====================================================================
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_login'])) {
            $identifier   = trim($_POST['identifier'] ?? '');
            $password     = $_POST['password'] ?? '';
            $keepLoggedIn = !empty($_POST['keep_logged_in']);

            $user = DB::fetch(
                "SELECT * FROM users WHERE username = ? OR email = ?",
                [$identifier, $identifier]
            );

            if ($user && password_verify($password, $user->password)) {
                if ((int)$user->state === 1) {
                    $_SESSION['user_id']  = $user->id;
                    $_SESSION['username'] = $user->username;

                    if ($keepLoggedIn) {
                        RememberMe::issue($user->id);
                    }

                    if (!array_key_exists('flash_messages', $_SESSION)) {
                        $_SESSION['flash_messages'] = [];
                    }
                    $_SESSION['flash_messages']['success'][] = "Login successful! Welcome back, " . htmlspecialchars($user->username) . ".";

                    session_write_close();
                    header("Location: /tracker", true, 302);
                    exit;

                } else {
                    $message = "<div class='alert error'>Account not verified. Please check your email.</div>";
                }
            } else {
                // Constant-time: avoid user enumeration via timing
                password_verify('dummy', '$2y$10$usesomesillystringforcomparewhichWillNeverMatch');
                $message = "<div class='alert error'>Invalid username or password.</div>";
            }
        }

        // =====================================================================
        // 6. Render Login Form
        // =====================================================================
        $this->_render_styles();
        ?>
        <div class="login-container">
            <h2>Login</h2>
            <?php echo $message; ?>
            <form method="POST" action="">
                <div class="form-group">
                    <label>Username or Email</label>
                    <input type="text" name="identifier" required autocomplete="username">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required autocomplete="current-password">
                </div>
                <div class="form-group keep-logged-in">
                    <label class="checkbox-label">
                        <input type="checkbox" name="keep_logged_in" value="1">
                        Keep me logged in for 21 days
                    </label>
                </div>
                <button type="submit" name="do_login">Sign In</button>
            </form>
            <p class="form-footer-links">
                <a href="/login?view=forgot">Forgot your password?</a>
                &nbsp;·&nbsp;
                Need an account? <a href="/register">Register here</a>
            </p>
        </div>
        <?php
    }

    // =========================================================================
    // Sub-form: Forgot Password
    // =========================================================================
    private function _render_forgot_form(string $message = ''): void {
        ?>
        <div class="login-container">
            <h2>Forgot Password</h2>
            <?php echo $message; ?>
            <?php if (!$message): ?>
            <p style="font-size:0.9em; margin-bottom:1rem; color:#555;">
                Enter your email address and we'll send you a reset link.
            </p>
            <form method="POST" action="">
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" name="email" required autocomplete="email">
                </div>
                <button type="submit" name="do_forgot">Send Reset Link</button>
            </form>
            <?php endif; ?>
            <p class="form-footer-links">
                <a href="/login">Back to Sign In</a>
            </p>
        </div>
        <?php
    }

    // =========================================================================
    // Sub-form: Set New Password
    // =========================================================================
    private function _render_reset_form(string $token, string $message = ''): void {
        ?>
        <div class="login-container">
            <h2>Reset Password</h2>
            <?php echo $message; ?>
            <form method="POST" action="">
                <input type="hidden" name="reset_token" value="<?php echo htmlspecialchars($token); ?>">
                <div class="form-group">
                    <label>New Password</label>
                    <input type="password" name="new_password" required autocomplete="new-password" minlength="8">
                </div>
                <div class="form-group">
                    <label>Confirm New Password</label>
                    <input type="password" name="confirm_password" required autocomplete="new-password" minlength="8">
                </div>
                <button type="submit" name="do_reset">Set New Password</button>
            </form>
            <p class="form-footer-links">
                <a href="/login">Back to Sign In</a>
            </p>
        </div>
        <?php
    }

    // =========================================================================
    // Shared Styles
    // =========================================================================
    private function _render_styles(): void {
        ?>
        <style>
            .login-container { max-width: 400px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: sans-serif; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input[type="text"],
            .form-group input[type="email"],
            .form-group input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            .keep-logged-in label { font-weight: normal; display: flex; align-items: center; gap: 8px; cursor: pointer; }
            .keep-logged-in input[type="checkbox"] { width: auto; }
            button[type="submit"] { width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1em; }
            button[type="submit"]:hover { background-color: #0056b3; }
            .alert { padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 0.9em; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .form-footer-links { margin-top: 12px; font-size: 0.9em; text-align: center; }
        </style>
        <?php
    }
}