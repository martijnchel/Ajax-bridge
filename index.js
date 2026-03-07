const axios = require('axios');
const crypto = require('crypto');

const { AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HOMEY_WEBHOOK_URL } = process.env;

const API_BASE = "https://api.ajax.systems/api"; 
let sessionToken = '';
let detectedUserId = '';
let detectedHubId = '';

function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function login() {
    try {
        console.log("Stap 1: Inloggen...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        
        sessionToken = res.data.sessionToken;
        detectedUserId = res.data.userId; // We pakken het ID uit de login response
        console.log(`✅ Ingelogd. User ID: ${detectedUserId}`);
        
        await discoverHub();
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

async function discoverHub() {
    try {
        console.log("Stap 2: Hubs zoeken voor deze gebruiker...");
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        if (res.data && res.data.length > 0) {
            detectedHubId = res.data[0].id; // We pakken de eerste hub uit de lijst
            console.log(`✅ Hub gevonden: ${res.data[0].name} (ID: ${detectedHubId})`);
            checkStatus();
        } else {
            console.error("❌ FOUT: Dit account heeft geen toegang tot Hubs. Voeg dit account toe in de Ajax App!");
            setTimeout(discoverHub, 60000);
        }
    } catch (err) {
        console.error("❌ Discovery Fout:", err.response?.status, err.response?.data || err.message);
    }
}

async function checkStatus() {
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${detectedHubId}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;
        const statusReport = {
            alarm: hub.armedState,
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`🚀 Update naar Homey: ${statusReport.alarm} | Hub: ${statusReport.online}`);
        
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => console.error("Homey onbereikbaar"));

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error("❌ Status Fout:", err.response?.status);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}

login();
