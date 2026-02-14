<?php
namespace bobmitch\bar\Widgets\BarTracker;

Use HoltBosse\Alba\Core\{CMS,Widget};
Use HoltBosse\DB\DB;

class BarTracker extends Widget {

	public function render() {
        if (!isset($_SESSION['user_id'])) {
            CMS::Instance()->queue_message('You must be logged in to access the Bar Tracker widget.', 'danger','/login');
            header("Location: /login");
            exit;
        }
        else {
            // logged in, set window.uuid for JS use
            $user = DB::fetch('select uuid from users where id=?', $_SESSION['user_id']);
            $uuid = $user->uuid ?? 'unknown-uuid';
            echo "<script>window.uuid = " . json_encode($uuid) . ";</script>";
        }
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
								<div class="stat-row">
									<span class="stat-label">State:</span>
									<span class="stat-value">INITIALIZING...</span>
								</div>
								<div class="stat-row">
									<span class="stat-label">Units:</span>
									<span class="stat-value">0</span>
								</div>
								<div class="stat-row">
									<span class="stat-label">Energy:</span>
									<span class="stat-value">0 / 0</span>
								</div>
								<div class="stat-row">
									<span class="stat-label">Metal:</span>
									<span class="stat-value">0 / 0</span>
								</div>
								<div class="stat-row">
									<span class="stat-label">Paused:</span>
									<span class="stat-value">No</span>
								</div>
							</div>

							<!-- UUID Display -->
							<div id="tokenstuff" style="display:none;">
								<?php 
								$uuid = DB::fetch('select uuid from users where id=?', $_SESSION['user_id'] ?? 0)->uuid ?? 'unknown-uuid';
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
					<div class="layout-controls">
						<button id="add-widget-dropdown-btn" class="bar-btn-primary">+ Add Widget</button>
						<button id="edit-layout-btn" class="bar-btn-small">Edit Layout</button>
						<button id="exit-streaming-btn" class="bar-btn-small">Back to Dashboard</button>

						<div id="widget-library-dropdown" class="bar-panel widget-dropdown hidden">
							<button class="widget-add-btn" data-widget="game-timer">⏱️ Timer</button>
							<button class="widget-add-btn" data-widget="economy-minimal">💰 Economy</button>
							<button class="widget-add-btn" data-widget="combat-overview">⚔️ Combat</button>
							<button class="widget-add-btn" data-widget="trigger-panel">🎯 Alerts</button>
						</div>
					</div>
					<div id="streaming-widgets-container"></div>
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

		<!-- Core Game Systems -->
		<script src="/src/Widgets/BarTracker/gameStateStore.js"></script>
		<script src="/src/Widgets/BarTracker/triggerEngine.js"></script>
		<script src="/src/Widgets/BarTracker/streamingWidgets.js"></script>

		<!-- UI Managers -->
		<script src="/src/Widgets/BarTracker/uiManager.js"></script>
		<script src="/src/Widgets/BarTracker/triggersManager.js"></script>
		<script src="/src/Widgets/BarTracker/eventHandler.js"></script>

		<!-- Audio Barrier Initialization -->
		<script>
			// Initialize audio context on first user interaction
			const startBtn = document.getElementById('start-btn');
			const audioBarrier = document.getElementById('audio-barrier');
			
			if (startBtn && audioBarrier) {
				startBtn.addEventListener('click', function() {
					console.log('🎵 Audio initialization clicked');
					
					// Initialize Web Audio API
					try {
						const AudioContext = window.AudioContext || window.webkitAudioContext;
						if (AudioContext && !triggerEngine.audioContext) {
							triggerEngine.audioContext = new AudioContext();
							console.log('✅ Web Audio API initialized');
						}
					} catch (err) {
						console.warn('⚠️ Web Audio API not available:', err);
					}
					
					// Close the barrier modal
					audioBarrier.style.display = 'none';
					console.log('✅ Audio barrier closed');
					
					// Optional: Play a test sound
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
		</script>

		<!-- Trigger Registration - SAFE INITIALIZATION -->
		<script>
			<?php
			$all_triggers = DB::fetchAll('select * from controller_triggers where state=1 order by ordering ASC');
			foreach($all_triggers as $trigger) {
				$conditions = $trigger->conditions ? $trigger->conditions : "(event) => false";
				$actions = $trigger->actions ? $trigger->actions : "(event) => {}";

				$conditions = str_replace("[NEWLINE]", "", $conditions);
				$actions = str_replace("[NEWLINE]", "", $actions);

				$output_js = "triggerEngine.registerTrigger({";
				$output_js .= "id: " . $trigger->id . ",";
				$output_js .= "name: \"" . addslashes($trigger->title) . "\",";
				$output_js .= "description: \"" . addslashes($trigger->description) . "\",";
				$output_js .= "cooldown: " . ($trigger->repeatable_interval ? ($trigger->repeatable_interval * 1000) : 'triggerEngine.defaultCooldown') . ",";
				$output_js .= "repeatable: " . ($trigger->repeatable===1 ? 'true' : 'false') . ",";
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
			});
		</script>

		<!-- Styles -->
		<style>
			<?php echo file_get_contents(__DIR__ . '/style.css'); ?>
		</style>

		<?php
	}
}