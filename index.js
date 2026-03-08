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
        console.log("Inloggen bij Ajax Cloud voor Realtime Stream...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        sessionToken = res.data.sessionToken;
        detectedUserId = res.data.userId; 
        console.log("✅ Verbinding gemaakt. Status ophalen en stream starten...");
        
        // Eerst eenmalig de huidige status ophalen
        await fetchAndSendStatus();
        // Daarna de realtime stream starten
        startEventStream();
    } catch (err) {
        console.error("❌ Login Fout:", err.message);
        setTimeout(login, 30000);
    }
}

// Functie die de status naar Homey stuurt
async function fetchAndSendStatus() {
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

        console.log(`🚀 [REALTIME] Verzonden naar Homey: ${statusReport.alarm}`);
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`);
    } catch (err) {
        console.error("Fout bij ophalen status:", err.message);
    }
}

// De Stream: Dit luistert live naar wijzigingen
async function startEventStream() {
    const streamUrl = `${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}/events`;
    
    try {
        const response = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        console.log("📡 Luisteren naar live Ajax events...");

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (let line of lines) {
                if (line.trim()) {
                    console.log("⚡ Event ontvangen! Status direct verversen...");
                    fetchAndSendStatus(); // Bij ELK event verversen we direct de status
                }
            }
        });

        response.data.on('end', () => {
            console.log("⚠️ Stream gesloten, opnieuw verbinden...");
            startEventStream();
        });

    } catch (err) {
        console.error("❌ Stream Fout:", err.message);
        if (err.response?.status === 401) login();
        else setTimeout(startEventStream, 5000);
    }
}

login();
