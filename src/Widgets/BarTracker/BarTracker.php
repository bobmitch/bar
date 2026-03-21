<?php
namespace bobmitch\bar\Widgets\BarTracker;

Use HoltBosse\Alba\Core\{CMS,Widget};
Use HoltBosse\DB\DB;
use bobmitch\bar\Helpers\CSRF;
use bobmitch\bar\Helpers\RememberMe;

class BarTracker extends Widget {

	public function render() {
        if (!isset($_SESSION['user_id'])) {
            CMS::Instance()->queue_message('You must be logged in to access the Bar Tracker widget.', 'danger','/login');
            header("Location: /login");
            exit;
        }
        else {
            // logged in, set window.uuid for JS use
            $user = DB::fetch('select uuid,state from users where id=?', $_SESSION['user_id']);
			// Guard: user deleted or de-activated since cookie was issued
			if (!$user || (int)$user->state !== 1) {
				RememberMe::revokeAll((int)$_SESSION['user_id']);
				session_destroy();
				header("Location: /login");
				exit;
			}

            $uuid = $user->uuid ?? 'unknown-uuid';
            echo "<script>window.uuid = " . json_encode($uuid) . ";</script>";
			?>
			<!-- OBS Detection — defined early, used throughout -->
			<script>
				function isRunningInOBS() { return !!window.obsstudio; }
				console.log('🔍 OBS check:', isRunningInOBS(), '| obsstudio:', window.obsstudio);
			</script>
			<?php
        }

        $csrf_token = CSRF::getToken();
        echo "<script>window.csrfToken = " . json_encode($csrf_token) . ";</script>";
        
		?>

		<div class="bar-widget-container">
			<!-- Audio Barrier Modal -->
			<div id="audio-barrier" class="modal-overlay">
				<div class="modal-content bar-panel">
					<h2>🎵 SYSTEM INITIALIZED</h2>
					<p>Click required to enable audio</p>
					<button id="start-btn" class="bar-btn-primary">INITIALIZE AUDIO</button>
				</div>
			</div>

			<!-- Header -->
			<header class="bar-header">
				<div class="bar-brand">BAR TRACKER <span class="v-tag">v0.2 Dev</span></div>
				<div class="header-status">
					<button id="copy-uuid-btn" class="bar-btn-small" title="Copy your UUID to clipboard">📋 Copy UUID</button>
					<button id="reset-all-btn" class="bar-btn-small bar-btn-danger" title="Reset all game state">↺ RESET</button>
					<div id="connection-status" class="status-badge disconnected">🔴 OFFLINE</div>
					<div id="game-time" class="timer">00:00</div>
				</div>
			</header>

			<!-- Navigation Tabs -->
			<nav class="bar-tabs">
				<button class="tab-btn active" data-tab="standard">📊 DASHBOARD</button>
				<button class="tab-btn" data-tab="triggers">🎯 TRIGGERS</button>
				<button class="tab-btn" data-tab="settings">⚙️ SETTINGS</button>
				<button class="tab-btn" data-tab="streaming">📡 STREAMING</button>
			</nav>

			<!-- Main Content -->
			<main class="bar-content">

				<!-- ========== DASHBOARD VIEW ========== -->
				<section id="standard-view" class="view-section active">
					<div class="grid-layout">
						<!-- Event Log Panel -->
						<div class="bar-panel event-log-panel">
							<div class="panel-header">
								<h3>⚔️ BATTLE LOG</h3>
								<button class="bar-btn-small" id="clear-log-btn">Clear</button>
							</div>
							<div id="event-log" class="event-log">
								<div class="event-empty">WAITING FOR DATA STREAM...</div>
							</div>
						</div>

						<!-- Stats Panel -->
						<div class="bar-panel stats-panel">
							<div class="panel-header">
								<h3>📈 TEAM STATUS</h3>
							</div>
							<div id="status" class="status-content">
								<p>Loading team status...</p>
							</div>

							<!-- UUID Display -->
							<div id="tokenstuff" style="display:none;">
								<?php 
								echo "<textarea>" . htmlspecialchars($uuid) . "</textarea>";
								?>
							</div>
						</div>
					</div>
				</section>

				<!-- ========== TRIGGERS VIEW ========== -->
				<section id="triggers-view" class="view-section">
					<div class="bar-panel full-width">
						<div class="panel-header">
							<h3>🎯 TRIGGER MANAGEMENT</h3>
						</div>
						<p class="panel-subtitle">Create soundpacks and assign audio to triggers</p>

						<!-- Soundpack Manager inserted here by triggersManager.js -->
						<div id="soundpack-manager-placeholder"></div>

						<!-- Trigger List -->
						<div class="bar-panel" style="margin-top: 20px;">
							<div class="panel-header">
								<h3>📋 CONFIGURED TRIGGERS</h3>
								<div class="panel-actions">
									<button id="enable-all-triggers" class="bar-btn-small">✓ ENABLE ALL</button>
									<button id="disable-all-triggers" class="bar-btn-small">✗ DISABLE ALL</button>
								</div>
							</div>
							<div id="trigger-list" class="trigger-list">
								<p class="empty-state">Loading triggers...</p>
							</div>
						</div>
					</div>
				</section>

				<!-- ========== SETTINGS VIEW ========== -->
				<section id="settings-view" class="view-section">
					<div class="bar-panel full-width">
						<div class="panel-header">
							<h3>⚙️ AUDIO & TRIGGER SETTINGS</h3>
						</div>

						<!-- Audio Settings -->
						<div class="settings-group">
							<h4>🔊 Audio Control</h4>
							<div class="setting-item">
								<label for="master-volume">Master Volume</label>
								<div class="volume-control">
									<input type="range" id="master-volume" min="0" max="100" value="80" class="slider">
									<span id="master-volume-value" class="volume-value">80%</span>
								</div>
							</div>
						</div>

						<!-- Trigger Settings -->
						<div class="settings-group">
							<h4>🎯 Trigger Control</h4>
							<div class="setting-item">
								<button id="enable-all-settings" class="bar-btn-primary">Enable All Triggers</button>
								<button id="disable-all-settings" class="bar-btn-primary">Disable All Triggers</button>
							</div>
						</div>

						<!-- About -->
						<div class="settings-group">
							<h4>ℹ️ About</h4>
							<p>BAR Tracker v0.2 Development</p>
							<p>Real-time trigger and audio system for Beyond All Reason</p>
						</div>
					</div>
				</section>

				<!-- ========== STREAMING VIEW ========== -->
				<section id="streaming-view" class="view-section">

                    <!-- Slim HUD bar — fades in on mouse movement, auto-hides after 2.5 s idle -->
                    <div id="wm-hud">
                        <span class="wm-hud-brand">BAR · STREAM</span>
                        <span class="wm-hud-spacer"></span>
                        <span class="wm-hud-hints">
                            move mouse = edit mode &nbsp;·&nbsp;
                            scroll = scale &nbsp;·&nbsp;
                            dblclick widget = toggle &nbsp;·&nbsp;
                            middle click = lock/unlock &nbsp;·&nbsp;
                            right click = back
                        </span>
                        <button id="wm-lock-btn">🔓 LOCK</button>
                        <button class="wm-hud-back" id="wm-back-btn">← BACK</button>
                    </div>

                    <!-- Widget mount point -->
                    <div id="streaming-widgets-container"></div>

                    <!-- Shown when edit mode is active -->
                    <div id="wm-disabled-hint">EDIT MODE — HIDDEN WIDGETS VISIBLE</div>

                </section>

			</main>
		</div>

		<!-- Scripts -->
		<script>
			const units_string = `<?php echo file_get_contents(__DIR__ . '/units_en.json'); ?>`;
			const unitDefs_string = `<?php echo file_get_contents(__DIR__ . '/unitDefs.json'); ?>`;
			let units = JSON.parse(units_string);
			let unitDefs_raw = JSON.parse(unitDefs_string);
			let unitDefs = unitDefs_raw.d.unitDefs;
		</script>

        <!-- Event Types -->
        <script src="/src/Widgets/BarTracker/eventTypes.js"></script>

		<!-- Core Game Systems -->
		<script src="/src/Widgets/BarTracker/gameStateStore.js"></script>
		<script src="/src/Widgets/BarTracker/triggerEngine.js"></script>

		<!-- Widget framework — must load before uiManager and barWidgets -->
		<script src="/src/Widgets/BarTracker/widgetManager.js"></script>

		<script src="/src/Widgets/BarTracker/barWidgets.js"></script>

		<!-- UI Managers -->
		<script src="/src/Widgets/BarTracker/uiManager.js"></script>
		<script src="/src/Widgets/BarTracker/triggersManager.js"></script>
		<script src="/src/Widgets/BarTracker/eventHandler.js"></script>

		<!-- Audio Barrier Initialization -->
		<script>
			function isRunningInOBS() { return !!window.obsstudio; }

			const startBtn    = document.getElementById('start-btn');
			const audioBarrier = document.getElementById('audio-barrier');

			if (isRunningInOBS()) {
				// In OBS: hide the modal entirely — no click needed
				if (audioBarrier) audioBarrier.style.display = 'none';
			} else {
				// Normal browser: show modal and wait for user click
				if (startBtn && audioBarrier) {
					startBtn.addEventListener('click', function() {
						console.log('🎵 Audio initialization clicked');

						try {
							const AudioContext = window.AudioContext || window.webkitAudioContext;
							if (AudioContext && !triggerEngine.audioContext) {
								triggerEngine.audioContext = new AudioContext();
								console.log('✅ Web Audio API initialized');
							}
						} catch (err) {
							console.warn('⚠️ Web Audio API not available:', err);
						}

						audioBarrier.style.display = 'none';
						console.log('✅ Audio barrier closed');

						try {
							const ctx = triggerEngine.audioContext;
							if (ctx) {
								const oscillator = ctx.createOscillator();
								const gain = ctx.createGain();
								oscillator.connect(gain);
								gain.connect(ctx.destination);
								oscillator.frequency.value = 880;
								gain.gain.setValueAtTime(0.1, ctx.currentTime);
								gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
								oscillator.start(ctx.currentTime);
								oscillator.stop(ctx.currentTime + 0.1);
								console.log('🔊 Test tone played');
							}
						} catch (err) {
							console.warn('⚠️ Could not play test tone:', err);
						}
					});
				} else {
					console.warn('⚠️ Audio barrier elements not found');
				}
			}
		</script>

		<!-- Trigger Registration - SAFE INITIALIZATION -->
		<script>
			<?php
			$all_triggers = DB::fetchAll('select * from controller_triggers where state=1 order by ordering ASC');
			//CMS::pprint_r ($all_triggers);
			foreach($all_triggers as $trigger) {
				$conditions = $trigger->conditions ? $trigger->conditions : "(event) => false";
				$actions = $trigger->actions ? $trigger->actions : "(event) => {}";

				$conditions = str_replace("[NEWLINE]", "", $conditions);
				$actions = str_replace("[NEWLINE]", "", $actions);

				$image_src  = $trigger->image_src ? addslashes($trigger->image_src) : '';

				$output_js = "triggerEngine.registerTrigger({";
				$output_js .= "id: " . $trigger->id . ",";
				$output_js .= "name: \"" . addslashes($trigger->title) . "\",";
				$output_js .= "description: \"" . addslashes($trigger->description) . "\",";
				$output_js .= "cooldown: " . ($trigger->repeatable_interval ? ($trigger->repeatable_interval * 1000) : 'triggerEngine.defaultCooldown') . ",";
				$output_js .= "priority: " . ($trigger->priority ?? 0) . ",";
				$output_js .= "interruptable: " . ($trigger->interruptable === null || $trigger->interruptable == 1 ? 'true' : 'false') . ",";
				$output_js .= "repeatable: " . ($trigger->repeatable==1 ? 'true' : 'false') . ",";
				$output_js .= "image_src: "   . ($image_src ? '"' . $image_src . '"' : 'null') . ",";
				$output_js .= "conditions: [" . $conditions . "],";
				$output_js .= "actions: [" . $actions . "]";
				$output_js .= "});";

				echo "// Trigger: " . addslashes($trigger->title) . "\n";
				echo $output_js . "\n";
			}
			?>
			
			// Initialize UI safely after all scripts loaded
			document.addEventListener('DOMContentLoaded', function() {
				console.log('✅ DOMContentLoaded - Initializing UI managers');
				
				// Initialize trigger list
				if (window.uiManager) {
					try {
						uiManager.initializeTriggerList();
						console.log('✅ uiManager initialized');
					} catch (err) {
						console.error('❌ Error initializing uiManager:', err);
					}
				}
				
				// Initialize triggers manager UI with fallback
				if (window.triggersManager) {
					try {
						triggersManager.renderTriggers();
						console.log('✅ triggersManager initialized');
					} catch (err) {
						console.error('❌ Error initializing triggersManager:', err);
					}
				} else {
					console.warn('⚠️ triggersManager not found, will retry...');
					setTimeout(() => {
						if (window.triggersManager) {
							try {
								triggersManager.renderTriggers();
								console.log('✅ triggersManager initialized (retry)');
							} catch (err) {
								console.error('❌ Error on triggersManager retry:', err);
							}
						} else {
							console.error('❌ triggersManager failed to initialize after retry');
						}
					}, 500);
				}

				// Initialize streaming widget layer
				if (window.widgetManager) {
					const container = document.getElementById('streaming-widgets-container');
					if (container) {
						widgetManager.mountAll(container);
						console.log('✅ Widget manager mounted');
					}
				}

				// Back button wires to uiManager
				const wmBack = document.getElementById('wm-back-btn');
				if (wmBack) {
					wmBack.addEventListener('click', () => uiManager.switchView('standard'));
				}

				// If running in OBS, start on streaming view
				if (isRunningInOBS()) {
					console.log('🚀 Detected OBS environment, switching to streaming view');
					setTimeout(() => {
						uiManager.switchView('streaming');
						// Optional: Show a brief alert in the HUD
						const hud = document.getElementById('wm-hud');
						if (hud) {
							const alert = document.createElement('div');
							alert.className = 'wm-hud-alert';
							alert.textContent = 'OBS MODE ACTIVE';
							hud.appendChild(alert);
							setTimeout(() => hud.removeChild(alert), 3000);
						}
					}, 1000);
				}

			});
		</script>

		<script><?php echo file_get_contents(__DIR__ . '/copy_uuid.js'); ?></script>

		<!-- Styles -->
		<style>
			<?php echo file_get_contents(__DIR__ . '/style.css'); ?>
		</style>

		<?php
	}
}