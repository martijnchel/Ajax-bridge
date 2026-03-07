const axios = require('axios');
const crypto = require('crypto');

const { AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HOMEY_WEBHOOK_URL } = process.env;
const TARGET_HUB_ID = "002E5080"; 
const API_BASE = "https://api.ajax.systems/api"; 

let sessionToken = '';
let detectedUserId = '';

function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function login() {
    try {
        console.log("Inloggen...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        sessionToken = res.data.sessionToken;
        detectedUserId = res.data.userId; 
        console.log("✅ Ingelogd.");
        checkStatus();
    } catch (err) {
        console.error("❌ Login Fout:", err.message);
        setTimeout(login, 60000);
    }
}

async function checkStatus() {
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;

        // --- HIER GEBEURT DE MAGIE: DUMP ALLES ---
        console.log("--- START DEBUG DATA ---");
        console.log(JSON.stringify(hub, null, 2));
        console.log("--- EINDE DEBUG DATA ---");

        // Stuur voor nu de basis door naar Homey (ook al klopt het nog niet)
        const report = {
            alarm: hub.armedState || "UNKNOWN",
            online: hub.online ? "ONLINE" : "OFFLINE"
        };
        
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(report))}`).catch(() => {});
        
        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error("Fout:", err.message);
        setTimeout(checkStatus, 60000);
    }
}

login();
