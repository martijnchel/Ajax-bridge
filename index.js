const axios = require('axios');
const crypto = require('crypto');

const { AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HOMEY_WEBHOOK_URL } = process.env;

const TARGET_HUB_ID = "002E5080"; 
const API_BASE = "https://api.ajax.systems/api"; 

let sessionToken = '';
let refreshToken = '';
let detectedUserId = '';

function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// STAP 1: LOGIN & TOKEN MANAGEMENT
async function login() {
    try {
        console.log("Enterprise Login opstarten...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        
        sessionToken = res.data.sessionToken;
        refreshToken = res.data.refreshToken; // Bewaren voor de refresh later
        detectedUserId = res.data.userId; 
        
        console.log(`✅ Ingelogd. User ID: ${detectedUserId}`);
        
        // Start de status monitor
        checkStatus();
        
        // Plan een token refresh over 10 minuten (Ajax verloopt na 15 min)
        setTimeout(refreshSession, 10 * 60 * 1000);
        
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

// STAP 2: REFRESH TOKEN (Voorkomt 'User not authorized' na 15 min)
async function refreshSession() {
    try {
        console.log("Sessie verversen...");
        const res = await axios.post(`${API_BASE}/refresh`, {
            refreshToken: refreshToken
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY }
        });
        
        sessionToken = res.data.sessionToken;
        refreshToken = res.data.refreshToken;
        console.log("✅ Sessie succesvol verlengd.");
        setTimeout(refreshSession, 10 * 60 * 1000);
    } catch (err) {
        console.error("❌ Refresh mislukt, opnieuw inloggen...");
        login();
    }
}

// STAP 3: STATUS MONITORING
async function checkStatus() {
    if (!sessionToken) return;

    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 
                'X-Session-Token': sessionToken, 
                'X-Api-Key': AJAX_X_API_KEY 
            }
        });

        const hub = res.data;

        // Volgens de Enterprise API docs: we kijken specifiek naar armedState
        // Mocht dit 'UNKNOWN' blijven, dan mappen we de interne Ajax codes.
        let alarmStatus = hub.armedState;
        
        if (!alarmStatus || alarmStatus === "UNKNOWN") {
            // Backup mapping voor verschillende Hub types
            alarmStatus = hub.status?.armedState || hub.state || "DISARMED";
        }

        const statusReport = {
            alarm: alarmStatus,
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`🚀 [${new Date().toLocaleTimeString()}] Hub ${TARGET_HUB_ID}: ${statusReport.alarm}`);
        
        // Stuur naar Homey
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

    } catch (err) {
        console.error(`❌ Status Check Fout:`, err.response?.status);
        if (err.response?.status === 401) {
            login(); // Direct herinloggen bij autorisatiefout
            return;
        }
    }
    
    // Polling interval: 60 seconden
    setTimeout(checkStatus, 60000);
}

login();
