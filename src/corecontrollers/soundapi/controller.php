<?php
/**
 * Sound Pack API Controller
 * Manages soundpack creation, audio file uploads, trigger mappings, and soundpack loading
 * 
 * Endpoints:
 *   POST   /soundapi/soundpack/create      - Create new soundpack
 *   POST   /soundapi/soundpack/upload      - Upload MP3 to trigger in soundpack
 *   POST   /soundapi/soundpack/test-audio  - Test play audio file
 *   GET    /soundapi/soundpack/load        - Load soundpack trigger mappings
 *   GET    /soundapi/soundpack/list        - List all soundpacks for user
 *   DELETE /soundapi/soundpack/remove      - Delete soundpack
 *   DELETE /soundapi/soundpack/removeaudio       - Remove audio from trigger
 *   POST   /soundapi/soundpack/setimage    - Set image_src on a trigger (Giphy URL)
 *   POST   /soundapi/soundpack/clearimage  - Clear image_src on a trigger
 *   GET    /soundapi/soundpack/giphysearch - Proxy Giphy sticker search (key stays server-side)
 */

namespace bartracker\controllers\soundpack;

use HoltBosse\Alba\Core\CMS;
use HoltBosse\Form\Input;
use HoltBosse\DB\DB;
use bobmitch\bar\Helpers\CSRF;
use bobmitch\bar\Helpers\RememberMe;

class SoundpackController {
    
    // Configuration constants
    const MAX_FILE_SIZE = 5242880; // 5MB in bytes
    const ALLOWED_MIMETYPES = ['audio/mpeg', 'audio/mp3'];
    const AUDIO_UPLOAD_DIR = '/src/audio/'; // Relative to web root
    const AUDIO_STORAGE_DIR = __DIR__ . '/../../audio/'; // Server path
    const MAX_IMAGE_URL_LENGTH = 2048;
    
    private $userId;
    private $method;
    private $action;
    private $response = [
        'success' => false,
        'message' => '',
        'data' => null
    ];

    public function __construct() {
        // Ensure session is started and attempt remember-me cookie login
        // if the session is missing (this controller bypasses CMS template rendering)
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (empty($_SESSION['user_id'])) {
            $user = RememberMe::attempt();
            if ($user) {
                $_SESSION['user_id']  = $user->id;
                $_SESSION['username'] = $user->username;
                session_regenerate_id(true);
            }
        }

        // Now verify user is logged in
        if (!isset($_SESSION['user_id'])) {
            $this->error('Unauthorized: User not logged in', 401);
            echo json_encode($this->response);
            return;
        }

        $this->userId = $_SESSION['user_id'];
        $this->method = $_SERVER['REQUEST_METHOD'];
        $this->action = CMS::Instance()->uri_segments[2] ?? '';

        // Ensure upload directory exists
        if (!is_dir(self::AUDIO_STORAGE_DIR)) {
            mkdir(self::AUDIO_STORAGE_DIR, 0755, true);
        }

        $this->route();
    }

    /**
     * Route API requests to appropriate handlers
     */
    private function route() {
        header('Content-Type: application/json');

        // Mutating actions require CSRF validation
        $mutatingActions = ['create', 'upload', 'test-audio', 'remove', 'removeaudio', 'setimage', 'clearimage'];

        if (in_array($this->action, $mutatingActions) && $this->method === 'POST') {
            if (!CSRF::validate()) {
                $this->error('Invalid or missing CSRF token', 403);
                // echo json_encode($this->response);
                return;
            }
        }


        switch ($this->action) {
            case 'create':
                if ($this->method === 'POST') {
                    $this->createSoundpack();
                }
                break;

            case 'upload':
                if ($this->method === 'POST') {
                    $this->uploadAudio();
                }
                break;

            case 'test-audio':
                if ($this->method === 'POST') {
                    $this->testAudio();
                }
                break;

            case 'load':
                if ($this->method === 'GET') {
                    $this->loadSoundpack();
                }
                break;

            case 'list':
                if ($this->method === 'GET') {
                    $this->listSoundpacks();
                }
                break;

            case 'remove':
                if ($this->method === 'POST') { // Using POST for delete due to PHP limitations
                    $this->removeSoundpack();
                }
                break;

            case 'removeaudio':
                if ($this->method === 'POST') {
                    $this->removeAudio();
                }
                break;
            case 'setimage':
                if ($this->method === 'POST') {
                    $this->setTriggerImage();
                }
                break;

            case 'clearimage':
                if ($this->method === 'POST') {
                    $this->clearTriggerImage();
                }
                break;
            case 'giphysearch':
                if ($this->method === 'GET') {
                    $this->giphySearch();
                }
                break;
            default:
                $this->error('Unknown action: ' . $this->action, 400);
        }

        echo json_encode($this->response);
    }

    /**
     * Create a new soundpack for the user
     * Required POST: title
     */
    private function createSoundpack() {
        $title = $_POST['title'] ?? null;

        if (!$title || strlen(trim($title)) === 0) {
            $this->error('Soundpack title is required');
            return;
        }

        $title = htmlspecialchars(trim($title), ENT_QUOTES, 'UTF-8');
        $alias = Input::stringURLSafe($title);
        try {
            $result = DB::exec('INSERT INTO controller_soundpacks (alias, created_by, updated_by, is_public, title, content_type) VALUES (?, ?, ?, 0, ?, 3)', [
                $alias,
                $this->userId,
                $this->userId,
                $title
            ]);

            if ($result) {
                $soundpackId = DB::getLastInsertedId();
                $this->success('Soundpack created successfully', [
                    'id' => $soundpackId,
                    'title' => $title
                ]);
            } else {
                $this->error('Failed to create soundpack');
            }
        } catch (\Exception $e) {
            $this->error('Database error: ' . $e->getMessage());
        }
    }

    /**
     * Upload MP3 audio file for a trigger in a soundpack
     * Required POST: soundpack_id, trigger_id
     * Required FILE: audio_file (mp3)
     */
    private function uploadAudio() {
        $soundpackId = intval($_POST['soundpack_id'] ?? 0);
        $triggerId = intval($_POST['trigger_id'] ?? 0);

        if (!$soundpackId || !$triggerId) {
            $this->error('Soundpack ID and Trigger ID are required');
            return;
        }

        // Verify soundpack belongs to user
        $soundpack = DB::fetch(
            'SELECT id FROM controller_soundpacks WHERE id = ? AND created_by = ?',
            [$soundpackId, $this->userId]
        );

        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        // Verify file upload
        if (!isset($_FILES['audio_file'])) {
            $this->error('No audio file provided');
            return;
        }

        $file = $_FILES['audio_file'];

        // Validate file
        $validation = $this->validateAudioFile($file);
        if (!$validation['valid']) {
            $this->error($validation['message']);
            return;
        }

        // Generate unique filename
        $filename = $this->generateAudioFilename($soundpackId, $triggerId);

        // Move file to storage
        $filepath = self::AUDIO_STORAGE_DIR . $filename;
        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            $this->error('Failed to save audio file');
            return;
        }

        // Delete old audio for this trigger+soundpack combo if exists
        $old = DB::fetch(
            'SELECT filename FROM controller_sounds WHERE sound_pack = ? AND trigger_id = ?',
            [$soundpackId, $triggerId]
        );

        if ($old && file_exists(self::AUDIO_STORAGE_DIR . $old->filename)) {
            @unlink(self::AUDIO_STORAGE_DIR . $old->filename);
        }

        // Store in database
        try {
            DB::exec('delete from controller_sounds where sound_pack = ? and trigger_id = ?', [$soundpackId, $triggerId]);
            $alias = Input::stringURLSafe($title);
            DB::exec('insert into controller_sounds (title, alias, content_type, sound_pack, trigger_id, filename, created_by, updated_by) values (?, ?, 4, ?, ?, ?, ?, ?)', [
                $filename,
                $alias,
                $soundpackId,
                $triggerId,
                $filename,
                $this->userId,
                $this->userId
            ]);

            $this->success('Audio file uploaded successfully', [
                'filename' => $filename,
                'trigger_id' => $triggerId
            ]);
        } catch (\Exception $e) {
            // Clean up uploaded file
            @unlink($filepath);
            $this->error('Database error: ' . $e->getMessage());
        }
    }

    /**
     * Test play an audio file (returns URL for client-side playback)
     * Required POST: soundpack_id, trigger_id
     */
    private function testAudio() {
        $soundpackId = intval((int)($_POST['soundpack_id'] ?? 0));
        $triggerId = intval((int)($_POST['trigger_id'] ?? 0));
        if (!$soundpackId || !$triggerId) {
            $this->error('Soundpack ID and Trigger ID are required');
            return;
        }

        // Verify soundpack belongs to user
        $soundpack = DB::fetch(
            'SELECT id FROM controller_soundpacks WHERE id = ? AND created_by = ?',
            [$soundpackId, $this->userId]
        );

        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        // Get audio filename
        $audio = DB::fetch(
            'SELECT filename FROM controller_sounds WHERE sound_pack = ? AND trigger_id = ?',
            [$soundpackId, $triggerId]
        );

        if (!$audio) {
            $this->error('No audio file assigned to this trigger');
            return;
        }

        $filepath = self::AUDIO_STORAGE_DIR . $audio->filename;
        if (!file_exists($filepath)) {
            $this->error('Audio file not found on server');
            return;
        }

        $this->success('Audio file ready for playback', [
            'url' => self::AUDIO_UPLOAD_DIR . $audio->filename,
            'filename' => $audio->filename
        ]);
    }

    /**
     * Load all trigger->audio mappings for a soundpack
     * Required GET: soundpack_id
     * Returns: { triggerId: filename, ... }
     */
    private function loadSoundpack() {
        $soundpackId = intval($_GET['soundpack_id'] ?? 0);

        if (!$soundpackId) {
            $this->error('Soundpack ID is required');
            return;
        }

        $soundpack = DB::fetch(
            'SELECT * FROM controller_soundpacks WHERE id = ? AND (created_by = ? OR is_public = 1)',
            [$soundpackId, $this->userId]
        );

        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        try {
            $sounds = DB::fetchAll(
                'SELECT trigger_id, filename FROM controller_sounds WHERE sound_pack = ?',
                [$soundpackId]
            );

            $mapping = [];
            foreach ($sounds as $sound) {
                $mapping[$sound->trigger_id] = [
                    'filename' => $sound->filename,
                    'url'      => self::AUDIO_UPLOAD_DIR . $sound->filename
                ];
            }

            // Load image mappings for this soundpack
            $images = DB::fetchAll(
                'SELECT trigger_id, image_url FROM controller_soundpack_images WHERE sound_pack = ?',
                [$soundpackId]
            );

            $imageMapping = [];
            foreach ($images as $img) {
                $imageMapping[$img->trigger_id] = $img->image_url;
            }

            $isOwner = ($soundpack->created_by == $this->userId);
            $this->success('Soundpack loaded', [
                'soundpack_id' => $soundpackId,
                'title'        => $soundpack->title,
                'is_owner'     => $isOwner,
                'triggers'     => $mapping,
                'images'       => $imageMapping,
            ]);

        } catch (\Exception $e) {
            $this->error('Database error: ' . $e->getMessage());
        }
    }

    /**
     * List all soundpacks for the current user
     */
    private function listSoundpacks() {
        try {
            $soundpacks = DB::fetchAll(
                'SELECT id, title, created FROM controller_soundpacks WHERE (created_by = ? OR is_public = 1) ORDER BY created DESC',
                [$this->userId]
            );

            $this->success('Soundpacks retrieved', [
                'soundpacks' => $soundpacks
            ]);
        } catch (\Exception $e) {
            $this->error('Database error: ' . $e->getMessage());
        }
    }

    /**
     * Delete a soundpack and all associated audio files
     * Required DELETE: soundpack_id
     */
    private function removeSoundpack() {
        $raw_input = file_get_contents('php://input');
        $soundpackId = intval($_POST['soundpack_id'] ?? $_GET['soundpack_id'] ?? 0);
        if (!$soundpackId) {
            $this->error('Soundpack ID is required');
            return;
        }

        // Verify ownership
        $soundpack = DB::fetch(
            'SELECT id FROM controller_soundpacks WHERE id = ? AND created_by = ?',
            [$soundpackId, $this->userId]
        );

        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        try {
            // Get all audio files associated with this soundpack
            $sounds = DB::fetchAll(
                'SELECT filename FROM controller_sounds WHERE sound_pack = ?',
                [$soundpackId]
            );


            // Delete audio files from disk
            foreach ($sounds as $sound) {
                $filepath = self::AUDIO_STORAGE_DIR . $sound->filename;
                if (file_exists($filepath)) {
                    @unlink($filepath);
                }
            }

            // Delete database records
            DB::exec('delete from controller_sounds where sound_pack = ?', [$soundpackId]);
            DB::exec('delete from controller_soundpacks where id = ?', [$soundpackId]);
            DB::exec('DELETE FROM controller_soundpack_images WHERE sound_pack = ?', [$soundpackId]);

            $this->success('Soundpack deleted successfully');
        } catch (\Exception $e) {
            $this->error('Error deleting soundpack: ' . $e->getMessage());
        }
    }

    /**
     * Remove audio file from a specific trigger in a soundpack
     * Required DELETE: soundpack_id, trigger_id
     */
    private function removeAudio() {
        $soundpackId = intval($_POST['soundpack_id'] ?? $_GET['soundpack_id'] ?? 0);
        $triggerId = intval($_POST['trigger_id'] ?? $_GET['trigger_id'] ?? 0);

        if (!$soundpackId || !$triggerId) {
            $this->error('Soundpack ID and Trigger ID are required');
            return;
        }

        // Verify ownership
        $soundpack = DB::fetch(
            'SELECT id FROM controller_soundpacks WHERE id = ? AND created_by = ?',
            [$soundpackId, $this->userId]
        );

        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        try {
            // Get audio file
            $sound = DB::fetch(
                'SELECT filename FROM controller_sounds WHERE sound_pack = ? AND trigger_id = ?',
                [$soundpackId, $triggerId]
            );

            if ($sound) {
                $filepath = self::AUDIO_STORAGE_DIR . $sound->filename;
                if (file_exists($filepath)) {
                    @unlink($filepath);
                }

                DB::exec('delete from controller_sounds where sound_pack = ? and trigger_id = ?', [$soundpackId, $triggerId]);
            }

            $this->success('Audio file removed');
        } catch (\Exception $e) {
            $this->error('Error removing audio: ' . $e->getMessage());
        }
    }

    /**
     * VALIDATION & UTILITY METHODS
     */

    /**
     * Set (or update) the image_src on a trigger.
     * image_src is stored directly on controller_triggers — no soundpack involved.
     * Required POST: trigger_id, image_url
     * image_url may be empty string to clear.
     */
    private function setTriggerImage() {
        $soundpackId = intval($_POST['soundpack_id'] ?? 0);
        $triggerId   = intval($_POST['trigger_id']   ?? 0);
        $imageUrl    = trim($_POST['image_url']       ?? '');

        if (!$soundpackId || !$triggerId) {
            $this->error('Soundpack ID and Trigger ID are required');
            return;
        }

        if ($imageUrl !== '') {
            if (strlen($imageUrl) > self::MAX_IMAGE_URL_LENGTH) {
                $this->error('Image URL is too long (max ' . self::MAX_IMAGE_URL_LENGTH . ' characters)');
                return;
            }
            if (!filter_var($imageUrl, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $imageUrl)) {
                $this->error('Invalid image URL — must start with http:// or https://');
                return;
            }
            $allowedHosts = [
                'media.giphy.com', 'media0.giphy.com', 'media1.giphy.com',
                'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com',
                'i.giphy.com',
            ];
            $parsedHost = strtolower(parse_url($imageUrl, PHP_URL_HOST) ?? '');
            if (!in_array($parsedHost, $allowedHosts)) {
                $this->error('Image URL host not allowed. Only Giphy CDN URLs are accepted.');
                return;
            }
        }

        // Verify soundpack belongs to user
        $soundpack = DB::fetch(
            'SELECT id FROM controller_soundpacks WHERE id = ? AND created_by = ?',
            [$soundpackId, $this->userId]
        );
        if (!$soundpack) {
            $this->error('Soundpack not found or access denied', 403);
            return;
        }

        try {
            if ($imageUrl !== '') {
                // make uuid title
                $title = 'sp' . $soundpackId . '_t' . $triggerId . '_' . bin2hex(random_bytes(8));
                DB::exec(
                    'INSERT INTO controller_soundpack_images (content_type,title,alias,sound_pack, trigger_id, image_url, created_by, updated_by)
                    VALUES (5,?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE image_url = ?, updated_by = ?',
                    [$title, $title, $soundpackId, $triggerId, $imageUrl, $this->userId, $this->userId, $imageUrl, $this->userId]
                );
            } else {
                DB::exec(
                    'DELETE FROM controller_soundpack_images WHERE sound_pack = ? AND trigger_id = ?',
                    [$soundpackId, $triggerId]
                );
            }

            $this->success($imageUrl !== '' ? 'Trigger image updated' : 'Trigger image cleared', [
                'soundpack_id' => $soundpackId,
                'trigger_id'   => $triggerId,
                'image_src'    => $imageUrl !== '' ? $imageUrl : null,
            ]);
        } catch (\Exception $e) {
            $this->error('Database error: ' . $e->getMessage());
        }
    }

    /**
     * Clear the image_src on a trigger.
     * Required POST: trigger_id
     */
    private function clearTriggerImage() {
        $_POST['image_url'] = '';
        $this->setTriggerImage();
    }

    /**
     * Proxy Giphy sticker search — keeps the API key server-side.
     * Required GET: q (search query)
     * Optional GET: limit (default 18, max 24)
     */
    private function giphySearch() {
        $query  = trim($_GET['q'] ?? '');
        if ($query === '') {
            $this->error('Search query is required');
            return;
        }

        $limit  = min(24, max(1, intval($_GET['limit']  ?? 18)));
        $offset = max(0,          intval($_GET['offset'] ?? 0));

        $keyRow = DB::fetch("SELECT configuration FROM configurations WHERE name = 'giphy_api_key'");
        $apiKey = $keyRow ? trim($keyRow->configuration, '"') : '';

        if (!$apiKey) {
            $this->error('Giphy API key not configured. Add it to the configurations table with name "giphy_api_key".');
            return;
        }

        $url = 'https://api.giphy.com/v1/stickers/search?' . http_build_query([
            'api_key' => $apiKey,
            'q'       => $query,
            'limit'   => $limit,
            'offset'  => $offset,
            'rating'  => 'g',
            'lang'    => 'en',
        ]);

        $ctx = stream_context_create(['http' => [
            'timeout'       => 5,
            'ignore_errors' => true,
            'header'        => 'User-Agent: BAR-Tracker/1.0',
        ]]);

        $body = @file_get_contents($url, false, $ctx);

        if ($body === false) {
            $this->error('Failed to reach Giphy API');
            return;
        }

        $json = json_decode($body, true);

        if (isset($json['meta']['status']) && $json['meta']['status'] !== 200) {
            $this->error('Giphy error: ' . ($json['meta']['msg'] ?? 'Unknown'), $json['meta']['status']);
            return;
        }

        // fixed_height_small_still - static preview image (200w x 100h)
        // fixed_height_small - animated preview (200w x 100h)
        // fixed_height - full-size sticker (200w x variable h) — use webp if available for better performance
        $items = array_map(function($item) {
            return [
                'title'   => $item['title'] ?? '',
                'preview' => $item['images']['fixed_height_small']['url']
                        ?? $item['images']['fixed_height']['url']
                        ?? '',
                'url'     => $item['images']['fixed_height']['webp']
                        ?? $item['images']['fixed_height']['url']
                        ?? '',
            ];
        }, $json['data'] ?? []);

        // Giphy pagination info
        $totalCount = intval($json['pagination']['total_count'] ?? 0);
        $nextOffset = $offset + $limit;
        $hasMore    = $nextOffset < $totalCount;

        $this->success('Giphy results', [
            'items'       => $items,
            'has_more'    => $hasMore,
            'next_offset' => $nextOffset,
            'total'       => $totalCount,
        ]);
    }

    /**
     * Validate audio file upload
     */
    private function validateAudioFile($file) {
        // Check for upload errors
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return [
                'valid' => false,
                'message' => 'File upload error: ' . $this->getUploadErrorMessage($file['error'])
            ];
        }

        // Check file size
        if ($file['size'] > self::MAX_FILE_SIZE) {
            return [
                'valid' => false,
                'message' => 'File size exceeds 5MB limit. Uploaded: ' . round($file['size'] / 1048576, 2) . 'MB'
            ];
        }

        // Check MIME type
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mimeType, self::ALLOWED_MIMETYPES)) {
            return [
                'valid' => false,
                'message' => 'Invalid file type. Only MP3 files allowed. Detected: ' . $mimeType
            ];
        }

        // Additional check: MP3 magic number
        $handle = fopen($file['tmp_name'], 'rb');
        $header = fread($handle, 3);
        fclose($handle);

        if ($header !== 'ID3' && (ord($header[0]) & 0xFF) !== 0xFF) {
            return [
                'valid' => false,
                'message' => 'File does not appear to be a valid MP3'
            ];
        }

        return ['valid' => true];
    }

    /**
     * Generate unique audio filename with soundpack and trigger identifiers
     */
    private function generateAudioFilename($soundpackId, $triggerId) {
        $uuid = sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        return "sp{$soundpackId}_t{$triggerId}_{$uuid}.mp3";
    }

    /**
     * Get human-readable upload error message
     */
    private function getUploadErrorMessage($errorCode) {
        $errors = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds php.ini upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds form MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File upload was incomplete',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file',
            UPLOAD_ERR_EXTENSION => 'Upload stopped by extension'
        ];

        return $errors[$errorCode] ?? 'Unknown upload error';
    }

    /**
     * Response helpers
     */
    private function success($message, $data = null) {
        $this->response = [
            'success' => true,
            'message' => $message,
            'data' => $data
        ];
    }

    private function error($message, $httpCode = 400) {
        http_response_code($httpCode);
        $this->response = [
            'success' => false,
            'message' => $message,
            'data' => null
        ];
    }
}

// Instantiate and handle request
new SoundpackController();