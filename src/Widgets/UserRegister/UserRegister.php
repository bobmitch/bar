<?php

// requires
/*
ALTER TABLE users 
ADD COLUMN verification_key VARCHAR(255) NULL,
ADD COLUMN verification_expires TIMESTAMP NULL;
ADD COLUMN uuid CHAR(36) NOT NULL UNIQUE,
ADD INDEX idx_uuid (uuid);
*/


namespace bobmitch\bar\Widgets\UserRegister;

use HoltBosse\Alba\Core\{CMS,Mail,Widget,Messages};
use HoltBosse\DB\DB;


class UserRegister extends Widget {
    public function render() {
        $message = "";

        // --- PHASE 1: Handle Email Verification Link ---
        if (isset($_GET['verify_key'])) {
            $key = $_GET['verify_key'];
            $user = DB::fetchAll("SELECT id FROM users WHERE verification_key = ? AND verification_expires > NOW()", [$key]);

            if ($user) {
                DB::exec("UPDATE users SET state = 1, verification_key = NULL, verification_expires = NULL WHERE id = ?", [$user['id']]);
                CMS::Instance()->queue_message('Account verified! You can now log in.', 'success','/login');
                $message = "<div class='alert success'>Account verified! You can now log in.</div>";
            } else {
                $message = "<div class='alert error'>Invalid or expired verification link.</div>";
            }
        }

        // --- PHASE 2: Handle Form Submission ---
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_register'])) {
            $username = $_POST['username'];
            $email = $_POST['email'];
            $pass = password_hash($_POST['password'], PASSWORD_BCRYPT);
            $v_key = bin2hex(random_bytes(16));
            $v_expires = date('Y-m-d H:i:s', strtotime('+24 hours'));

            // Check if user exists
            $exists = DB::fetchAll("SELECT id FROM users WHERE email = ? OR username = ?", [$email, $username]);
            
            if ($exists) {
                $message = "<div class='alert error'>Username or Email already taken.</div>";
            } else {
                DB::exec("INSERT INTO users (username, email, password, state, verification_key, verification_expires, domain) VALUES (?, ?, ?, 0, ?, ?, 0)", 
                          [$username, $email, $pass, $v_key, $v_expires]);
                
                $this->sendMail($email, $v_key);
                $message = "<div class='alert success'>Registration successful! Check your email to verify your account.</div>";
            }
        }

        // --- PHASE 3: View Rendering ---
        ?>
        <div class="registration-container">
            <h2>Create Account</h2>
            <?php echo $message; ?>

            <form method="POST" action="">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" name="email" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required>
                </div>
                <button type="submit" name="do_register">Register</button>
            </form>
        </div>

        <style>
            .registration-container { max-width: 400px; margin: 20px auto; padding: 20px; border: 1px solid #ccc; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; }
            .form-group input { width: 100%; padding: 8px; box-sizing: border-box; }
            .alert { padding: 10px; margin-bottom: 10px; border-radius: 4px; }
            .success { background: #d4edda; color: #155724; }
            .error { background: #f8d7da; color: #721c24; }
        </style>
        <?php
    }

    private function sendMail($to, $key) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https://" : "http://";
        $url = $protocol . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
        // Remove existing query strings if any
        $clean_url = strtok($url, '?');
        $verify_link = $clean_url . "?verify_key=" . $key;

        $mail = new Mail();
        $mail->addAddress($to,"Recipient");
        $mail->subject = "BAR Announcer: Verify Your Account";
        
        $body = "<h1>Welcome!</h1><p>Please click the link below to verify your account:</p>";
        $body .= "<a href='{$verify_link}'>{$verify_link}</a>";

        $mail->html = $body;
        $mail->send();
    }
}