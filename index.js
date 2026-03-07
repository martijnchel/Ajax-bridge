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

async function login() {
    try {
        console.log("Stap 1: Enterprise Login...");
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
        setTimeout(refreshSession, 10 * 60 * 1000); // Elke 10 min refreshen
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

async function refreshSession() {
    try {
        const res = await axios.post(`${API_BASE}/refresh`, { refreshToken }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY }
        });
        sessionToken = res.data.sessionToken;
        refreshToken = res.data.refreshToken;
        console.log("Sessie ververst.");
        setTimeout(refreshSession, 10 * 60 * 1000);
    } catch (err) {
        login();
    }
}

async function checkStatus() {
    if (!sessionToken) return;
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;

        // Mapping gebaseerd op Ajax Enterprise Enums
        const statusReport = {
            alarm: hub.armedState || "DISARMED",
            online: hub.hubConnectionStatus || (hub.online ? "ONLINE" : "OFFLINE"),
            brand: hub.smokeAlarm || "SMOKE_ALARM_NOT_DETECTED",
            co: hub.coAlarm || "CO_ALARM_NOT_DETECTED",
            sabotage: hub.tamperedFront || "TAMPERED_FRONT_OK"
        };

        console.log(`🚀 Update verzonden: ${statusReport.alarm} | Hub: ${statusReport.online}`);
        
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error(`❌ Status Fout [${err.response?.status}]`);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}

login();
