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
		<div id="audio-barrier">
			<div class="modal-content">
				<h2>Welcome to the Site</h2>
				<p>Click below to enable audio features.</p>
				<button id="start-btn">Enter & Enable Audio</button>
			</div>
		</div>
		<h1>Bar Tracker Test Widget</h1>
        <div id='tokenstuff'>
            <?php 
            //CMS::pprint_r ($_ENV);
            //CMS::pprint_r ($_SESSION);
            $uuid = DB::fetch('select uuid from users where id=?', $_SESSION['user_id'] ?? 0)->uuid ?? 'unknown-uuid';
            echo "<textarea>" . htmlspecialchars($uuid) . "</textarea>";
            ?>
        </div>

		<div id='connection-status'></div>

		<div id='trigger-list'></div>

		<div id="status">Init</div>

		<div id="game-time"></div>

		<div id="event-log" style="width:100%; height:80vh;"></div>
		<script>
			const units_string = `<?php echo file_get_contents(__DIR__ . '/units_en.json'); ?>`;
			let units = JSON.parse(units_string);
		</script>

		<script src="/src/Widgets/BarTracker/gameStateStore.js"></script>
    	<script src="/src/Widgets/BarTracker/triggerEngine.js"></script>
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
		</script>

		<style>
			<?php echo file_get_contents(__DIR__ . '/style.css'); ?>
		</style>
		<?php
	}
}