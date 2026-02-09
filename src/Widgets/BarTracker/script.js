
const eventSource = new EventSource("https://barapi.bobmitch.com/subscribe?topic=" + encodeURIComponent(window.uuid));
const statusDisplay = document.getElementById("status");
const logArea = document.getElementById("log");

const barrier = document.getElementById('audio-barrier');
const startBtn = document.getElementById('start-btn');

let trackerUnits = {};  // dict of unitID: unitData - reset between game sessions - used to track damage taken, kills, time alive etc

let unitCompleteCostTrigger = 1000; // cost threshold for unit complete announcements (TODO: drive by slider in UI)
let unitLostCostTrigger = 500; // cost threshold for unit lost announcements (TODO: drive by slider in UI)

let metalReclaimed = 0;
let energyReclaimed = 0;

// DEBUG
let tierTwoAnnounce = true;

function say(text) {
    // Cancel previous speech to avoid overlapping
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

function getName(unitName) {
    // we don't recieve full names from game itself to save bandwidth
    // so we have a local json mapping of unit internal names to full names
    if (units.units.names.hasOwnProperty(unitName)) {
        return units.units.names[unitName];
    }
    return unitName;
}

startBtn.addEventListener('click', () => {
    barrier.style.display = 'none';
    say("Audio enabled. Welcome!");
});

eventSource.onmessage = function (event) {
    // example messages:
    // {"myTeamID":0,"attackerTeam":0,"myPlayerID":0,"allyTeamID":0,"unitID":7550,"playerName":"FilthyMitch","event":"UnitDestroyed","attackerName":"armnanotc","unitTeam":2,"attackerID":14992,"unitMetalCost":130,"unitDefID":177,"unitName":"armrectr","unitCategory":{"noweapon":true,"notship":true,"notair":true,"empable":true,"mobile":true,"surface":true,"all":true,"notsub":true,"nothover":true},"gameTime":416.033356,"attackerDefID":160}
    const data = JSON.parse(event.data);
    const prettyJsonString = JSON.stringify(data, null, 4);
    console.log("New message:", data);
    
    // create new h4 with data.event (type) and add to log
    const h4 = document.createElement('h4');
    h4.textContent = data.event;
    logArea.appendChild(h4);
    // create new p element and append to log area
    const p = document.createElement('p');
    p.textContent = prettyJsonString;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight; // auto scroll to bottom

    // use web speech synthesis to read out the event
    if (data.event === "EconomyUpdate") {
        // -- (current, storage, pull, income, expense, share, sent, received)
        return; // no further processing needed
    }
    if (data.event === "UnitDestroyed") {
        // check if the destroyed unit belongs to the player
        if (data.myTeamID !== data.unitTeam) {
            // not my unit
            say (`You destroyed another players ${getName(data.unitName)}`);
        }
        else {
            // check if unitmetal cost is above threshold
            if (data.unitMetalCost >= unitLostCostTrigger) {
                say (`Your ${getName(data.unitName)} was destroyed by ${getName(data.attackerName)}`);
            }
        }
    }
    if (data.event === "UnitFinished") {
        // add unit to internal roster of tracker units - overwrite, it shouldn't be there already for a finished event
        trackerUnits[data.unitID] = data;

        // relation can be: "self", "ally", or "enemy"
        if (data.relation === "self") {
            // only announce own unit completions
            if (data.unitTier > 1 && tierTwoAnnounce) {
                say (`Tier 2 achieved! Your ${getName(data.unitName)} is complete`);
            }
            else if (data.unitMetalCost >= unitCompleteCostTrigger) {
                say (`Your ${getName(data.unitName)} is complete`);
            } 
        }
    }
    if (data.event === "UnitDamaged") {
        // only ever receive damage events for own units
        // other info not possible to recieve currently 
        // (well, we could get damage to enemy units, not who did it, so...)
        // we will use this for now to track for potential triggers for audio cues
        // such as: Punching Bag (unit taken > x amount of damage in x amount of time) etc
        
        /* info from lua:

        SendData({
            event           = "UnitDamaged",
            unitID          = unitID or -1,
            unitDefID       = unitDefID or -1,
            unitTeam        = unitTeam or -1,
            damage          = damage or 0,
            paralyzer       = paralyzer or 0,
            weaponDefID     = weaponDefID or -1,
            projectileID    = projectileID or -1,
            attackerID      = attackerID or -1,
            attackerDefID   = attackerDefID or -1,
            attackerTeam    = attackerTeam or -1
        })

        */
        // accumulate damage taken for the unit
        if (trackerUnits.hasOwnProperty(data.unitID)) {
            if (!trackerUnits[data.unitID].hasOwnProperty('damageTaken')) {
                trackerUnits[data.unitID].damageTaken = 0;
            }
        }
        else {
            // unit not in tracker yet (probably started before tracking began since we limit in lua to our own units only)
            trackerUnits[data.unitID] = data;
            trackerUnits[data.unitID].damageTaken = 0;
        }
        trackerUnits[data.unitID].damageTaken += data.damage;
        console.log(`Unit ID ${data.unitID} has taken a total of ${trackerUnits[data.unitID].damageTaken} damage.`);
    }
};

eventSource.onopen = (e) => {
    console.log("Connection established");
    statusDisplay.textContent = "Status: Connected ✅";
    statusDisplay.style.color = "green";
};

eventSource.onerror = (e) => {
    console.error("EventSource failed:", e);
    statusDisplay.textContent = "Status: Disconnected ❌";
    statusDisplay.style.color = "red";
};
