const axios = require('axios');
const crypto = require('crypto');

console.log("Systeem: Script wordt geladen...");

const { AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HOMEY_WEBHOOK_URL } = process.env;

// Check of de variabelen er zijn
if (!AJAX_LOGIN || !AJAX_PASSWORD || !AJAX_X_API_KEY) {
    console.error("❌ FOUT: Omgevingsvariabelen ontbreken in Railway!");
    process.exit(1);
}

const TARGET_HUB_ID = "002E5080"; 
const API_BASE = "https://api.ajax.systems/api"; 

let sessionToken = '';
let refreshToken = '';
let detectedUserId = '';

function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function login() {
    try {
        console.log("Stap 1: Inloggen bij Ajax...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        
        sessionToken = res.data.sessionToken;
        refreshToken = res.data.refreshToken;
        detectedUserId = res.data.userId; 
        
        console.log(`✅ Ingelogd. User ID: ${detectedUserId}`);
        checkStatus();
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

async function checkStatus() {
    if (!sessionToken) return;
    try {
        console.log("Stap 2: Status ophalen...");
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;

        // Slimme status detectie voor Connectiviteit
        const isOnline = (hub.online === true || hub.hubConnectionStatus === 'ONLINE' || hub.connectionState === 'ONLINE');

        // Slimme status detectie voor Alarm (Nachtstand/Deeltraject overschrijft DISARMED)
        let currentAlarm = hub.armedState || "DISARMED";
        if (currentAlarm === "DISARMED") {
            if (hub.nightMode === true || hub.nightMode === 'ARMED') {
                currentAlarm = "NIGHT_MODE";
            } else if (hub.partial === true) {
                currentAlarm = "PARTIAL";
            }
        }

        const statusReport = {
            alarm: currentAlarm,
            online: isOnline ? "ONLINE" : "OFFLINE",
            brand: hub.smokeAlarm || "SMOKE_ALARM_NOT_DETECTED",
            co: hub.coAlarm || "CO_ALARM_NOT_DETECTED",
            sabotage: hub.tamperedFront || "TAMPERED_FRONT_OK"
        };

        console.log(`🚀 VERZONDEN: [${statusReport.alarm}] [Hub: ${statusReport.online}]`);
        
        // Naar Homey sturen
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(e => console.error("Homey Webhook Error"));

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error(`❌ Status Fout [${err.response?.status}]`);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}

// Start het proces
login();
