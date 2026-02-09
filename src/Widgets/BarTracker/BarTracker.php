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
			<div id="audio-barrier">
				<div class="modal-content bar-panel">
					<h2>SYSTEM INITIALIZED</h2>
					<p>ENABLE AUDIO SYNTHESIS FOR BATTLEFIELD INTEL</p>
					<button id="start-btn" class="bar-btn-primary">INITIALIZE AUDIO</button>
				</div>
			</div>

			<header class="bar-header">
				<div class="bar-brand">BAR TRACKER <span class="v-tag">v2.0</span></div>
				<div id="connection-status" class="status-badge disconnected">OFFLINE</div>
				<div id="game-time" class="timer">00:00</div>
			</header>

			<nav class="bar-tabs">
				<button class="tab-btn active" data-tab="standard">DASHBOARD</button>
				<button class="tab-btn" data-tab="triggers">TRIGGER LOGIC</button>
				<button class="tab-btn" data-tab="streaming">STREAMING</button>
			</nav>

			<main class="bar-content">
				<section id="standard-view" class="view-section active">
					<div class="grid-layout">
						<div class="bar-panel event-log-panel">
							<h3>BATTLE LOG</h3>
							<div id="event-log">
								<div class="event-empty">WAITING FOR DATA STREAM...</div>
							</div>
						</div>
						<div class="bar-panel stats-panel">
							<h3>TEAM STATUS</h3>
							<div id="status" class="status-text">INITIALIZING...</div>
							<div id="tokenstuff" style="display:none;">
								<?php 
								$uuid = DB::fetch('select uuid from users where id=?', $_SESSION['user_id'] ?? 0)->uuid ?? 'unknown-uuid';
								echo "<textarea>" . htmlspecialchars($uuid) . "</textarea>";
								?>
							</div>
						</div>
					</div>
				</section>

				<div id="streaming-mode" class="view-section">
					<div id="streaming-widgets-container"></div>
					<button id="exit-streaming-btn" class="bar-btn-small">Back to Dashboard</button>
					<button id="edit-layout-btn" class="bar-btn-small">Edit Layout</button>
				</div>

				<div id="layout-mode" class="view-section">
					<div class="layout-controls">
						<button id="add-widget-dropdown-btn" class="bar-btn-primary">Add Widget</button>
						<button id="save-layout-btn" class="bar-btn-primary">Save & Exit</button>
						<button id="reset-layout-btn" class="bar-btn-small">Reset Defaults</button>
						
						<div id="widget-library-dropdown" class="bar-panel hidden">
							<button class="widget-add-btn" data-widget="game-timer">⏱️ Timer</button>
							<button class="widget-add-btn" data-widget="economy-minimal">💰 Economy</button>
							<button class="widget-add-btn" data-widget="combat-overview">⚔️ Combat</button>
							<button class="widget-add-btn" data-widget="trigger-panel">🎯 Alerts</button>
						</div>
					</div>
					<div id="layout-widgets-container"></div>
				</div>

				<section id="triggers-view" class="view-section">
					<div class="bar-panel full-width">
						<div class="panel-header">
							<h3>ACTIVE LOGIC TRIGGERS</h3>
							<div class="panel-actions">
								<button id="enable-all-triggers" class="bar-btn-small">ENABLE ALL</button>
								<button id="disable-all-triggers" class="bar-btn-small">DISABLE ALL</button>
							</div>
						</div>
						<p class="panel-sub">Real-time monitoring of all JavaScript triggers registered in the engine.</p>
						<div id="trigger-list">
							</div>
					</div>
				</section>

				<section id="streaming-view" class="view-section">
					<div class="bar-panel">
						<h3>STREAMING OVERLAY</h3>
						<p>Configure widgets for live broadcast integration.</p>
					</div>
				</section>
			</main>
		</div>


		<script>
			const units_string = `<?php echo file_get_contents(__DIR__ . '/units_en.json'); ?>`;
			let units = JSON.parse(units_string);
		</script>

		<script src="/src/Widgets/BarTracker/gameStateStore.js"></script>
    	<script src="/src/Widgets/BarTracker/triggerEngine.js"></script>
		<script src="/src/Widgets/BarTracker/streamingWidgets.js"></script>
    	<script src="/src/Widgets/BarTracker/uiManager.js"></script>
    	<script src="/src/Widgets/BarTracker/eventHandler.js"></script>

		<script>
			function say(text) {
				// Cancel previous speech to avoid overlapping
				window.speechSynthesis.cancel();
				const utterance = new SpeechSynthesisUtterance(text);
				window.speechSynthesis.speak(utterance);
			}
			const startBtn = document.getElementById('start-btn');
			const barrier = document.getElementById('audio-barrier');
			startBtn.addEventListener('click', () => {
				barrier.style.display = 'none';
				say("Audio enabled. Welcome!");
			});

			// register all triggers
			// JS pattern
			/*
			registerTrigger(triggerDef) {
				const {
					id,
					name,
					description,
					enabled = true,
					cooldown = this.defaultCooldown,
					conditions = [],
					actions = []
				} = triggerDef;

				if (!id) throw new Error('Trigger must have an id');
				
				this.triggers.set(id, {
					id,
					name: name || id,
					description: description || '',
					enabled,
					cooldown,
					conditions, // Array of condition functions
					actions,    // Array of action functions (sound, visual, etc)
					createdAt: Date.now(),
					custom: true
				});

				this.triggerStates.set(id, {
					lastFired: null,
					fireCount: 0,
					cooldownActive: false
				});
			}
			*/
			<?php
			$all_triggers = DB::fetchAll('select * from controller_triggers where state=1 order by ordering ASC');
			foreach($all_triggers as $trigger) {
				// conditions and actions are stored as CSV strings of JS functions
				// if conditions or actions are empty, we should default to a function that returns false for conditions and a no-op for actions to avoid errors
				$conditions = $trigger->conditions ? $trigger->conditions : "(event) => false";
				$actions = $trigger->actions ? $trigger->actions : "(event) => {}";

				// remove "[NEWLINE]" from conditions and actions to allow storing newlines in the DB without breaking the JS output
				$conditions = str_replace("[NEWLINE]", "", $conditions);
				$actions = str_replace("[NEWLINE]", "", $actions);

				// since cooldown and conditions need to be output as actual functions , not strings, we have to output JS directly 
				// without converting the whole thing to JSON, which would turn functions into strings and break them. So we output the static parts as JSON and then append the functions as raw JS.
				$output_js = "triggerEngine.registerTrigger({";
				$output_js .= "id: " . $trigger->id . ",";
				$output_js .= "name: \"" . $trigger->title . "\",";
				$output_js .= "description: \"" . $trigger->description . "\",";
				$output_js .= "cooldown: " . ($trigger->repeat_cooldown ?? 'triggerEngine.defaultCooldown') . ",";
				$output_js .= "repeatable: " . ($trigger->repeatable===1 ? 'true' : 'false') . ",";
				$output_js .= "conditions: [" . $conditions . "],";
				$output_js .= "actions: [" . $actions . "]";
				//$output_js .= "custom: false"; // mark as non-custom so it can't be edited in the UI for now, since we have no UI for editing yet
				//$output_js .= "createdAt: " . strtotime($trigger->start);
				$output_js .= "});";

				//$output_js = str_replace(["\r", "\n"], ' ', $output_js); // remove newlines to avoid breaking the JS
				//echo $output_js . "\n";
				// alternatively, we could output the functions as strings and then use eval in JS - but NOPE
				echo "// PHP Trigger Registered: " . addslashes($trigger->title) . "\n";
				echo $output_js . "\n";
			}
			?>
		// render trigger list in UI
		uiManager.initializeTriggerList();
		</script>



		<style>
			<?php echo file_get_contents(__DIR__ . '/style.css'); ?>
		</style>
		<?php
	}
}