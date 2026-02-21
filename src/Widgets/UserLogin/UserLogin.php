<?php
namespace bobmitch\bar\Widgets\UserLogin;

use HoltBosse\Alba\Core\{CMS, Widget};
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

        // 3. Handle Login Submission
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_login'])) {
            $identifier  = trim($_POST['identifier'] ?? '');
            $password    = $_POST['password'] ?? '';
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

                    // Write flash message directly using the same structure as Messages::add()
                    // bypassing its internal redirect so we control the session write order
                    if (!array_key_exists('flash_messages', $_SESSION)) {
                        $_SESSION['flash_messages'] = [];
                    }
                    $_SESSION['flash_messages']['success'][] = "Login successful! Welcome back, " . htmlspecialchars($user->username) . ".";

                    // Guarantee session is written to disk before the redirect response is sent
                    session_write_close();

                    header("Location: /tracker", true, 302);
                    exit;

                    
                }
                else {
                    $message = "<div class='alert error'>Account not verified. Please check your email.</div>";
                }
            } else {
                // Constant-time: avoid user enumeration via timing
                password_verify('dummy', '$2y$10$usesomesillystringforcomparewhichWillNeverMatch');
                $message = "<div class='alert error'>Invalid username or password.</div>";
            }
        }

        // 4. Render login form
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
            <p style="margin-top:10px; font-size:0.9em;">
                Need an account? <a href="/register">Register here</a>
            </p>
        </div>

        <style>
            .login-container { max-width: 400px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: sans-serif; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input[type="text"],
            .form-group input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            .keep-logged-in label { font-weight: normal; display: flex; align-items: center; gap: 8px; cursor: pointer; }
            .keep-logged-in input[type="checkbox"] { width: auto; }
            button[name="do_login"] { width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button[name="do_login"]:hover { background-color: #0056b3; }
            .alert { padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 0.9em; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <?php
    }
}