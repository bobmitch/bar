
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


