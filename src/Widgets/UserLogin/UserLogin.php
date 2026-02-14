<?php
namespace bobmitch\bar\Widgets\UserLogin;

use HoltBosse\Alba\Core\{CMS,Widget};
Use HoltBosse\DB\DB;

class UserLogin extends Widget {
    public function render() {
        $message = "";

        // 1. Handle Logout
        if (isset($_GET['action']) && $_GET['action'] === 'logout') {
            session_destroy();
            header("Location: " . strtok($_SERVER["REQUEST_URI"], '?'));
            exit;
        }

        // 2. Handle Login Submission
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_login'])) {
            $identifier = $_POST['identifier']; // Can be username or email
            $password = $_POST['password'];

            // $user is obj not array
            $user = DB::fetch("SELECT * FROM users WHERE username = ? OR email = ?", [$identifier, $identifier]);

            if ($user && password_verify($password, $user->password)) {
                // Check if the account is verified
                if ((int)$user->state === 1) {
                    $_SESSION['user_id'] = $user->id;
                    $_SESSION['username'] = $user->username;
                    CMS::Instance()->queue_message("Login successful! Welcome back, " . htmlspecialchars($user->username) . ".", "success","/tracker");
                    die(); // should not reach here due to redirect, but just in case
                    //$message = "<div class='alert success'>Login successful! Welcome back, " . htmlspecialchars($user->username) . ".</div>";
                } else {
                    $message = "<div class='alert error'>Account not verified. Please check your email.</div>";
                }
            } else {
                $message = "<div class='alert error'>Invalid username or password.</div>";
            }
        }

        // 3. View Logic
        ?>
        <div class="login-container">
            <?php if (isset($_SESSION['user_id'])): ?>
                <?php header("Location: /"); exit; ?>
                <h2>Welcome, <?php echo htmlspecialchars($_SESSION['username']); ?></h2>
                <p>You are currently logged in.</p>
                <a href="?action=logout" class="btn-logout">Logout</a>
            <?php else: ?>
                <h2>Login</h2>
                <?php echo $message; ?>
                <form method="POST" action="">
                    <div class="form-group">
                        <label>Username or Email</label>
                        <input type="text" name="identifier" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" required>
                    </div>
                    <button type="submit" name="do_login">Sign In</button>
                </form>
                <p style="margin-top:10px; font-size: 0.9em;">
                    Need an account? <a href="/register">Register here</a>
                </p>
            <?php endif; ?>
        </div>

        <style>
            .login-container { max-width: 400px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: sans-serif; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            button { width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background-color: #0056b3; }
            .btn-logout { display: inline-block; padding: 8px 15px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; }
            .alert { padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 0.9em; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
        <?php
    }
}