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
        console.log("Inloggen bij Ajax Cloud...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        sessionToken = res.data.sessionToken;
        detectedUserId = res.data.userId; 
        console.log("✅ Verbinding gemaakt. Start snelle status-check (5s)...");
        checkStatus();
    } catch (err) {
        console.error("❌ Login Fout:", err.message);
        setTimeout(login, 30000);
    }
}

async function checkStatus() {
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;
        const statusReport = {
            alarm: hub.state || "DISARMED",
            online: (hub.activeChannels && hub.activeChannels.length > 0) ? "ONLINE" : "OFFLINE",
            brand: (hub.fireAlarm && hub.fireAlarm.state === "ALARM") ? "SMOKE_ALARM_DETECTED" : "SMOKE_ALARM_NOT_DETECTED",
            co: (hub.coAlarm && hub.coAlarm.state === "ALARM") ? "CO_ALARM_DETECTED" : "CO_ALARM_NOT_DETECTED",
            sabotage: (hub.hubMalfunctions && hub.hubMalfunctions.length > 0) ? "TAMPERED_FRONT_OPEN" : "TAMPERED_FRONT_OK"
        };

        // Alleen loggen en sturen als er iets veranderd is of elke 30 seconden als hartslag
        console.log(`🚀 Status Check: [${statusReport.alarm}]`);
        
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

        // We zetten de check op 5 seconden voor een "realtime" gevoel
        setTimeout(checkStatus, 5000); 
    } catch (err) {
        console.error("Fout bij ophalen status:", err.message);
        if (err.response?.status === 401) {
            login();
        } else {
            setTimeout(checkStatus, 10000);
        }
    }
}

login();
