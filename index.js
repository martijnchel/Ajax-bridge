const axios = require('axios');
const crypto = require('crypto');

const { AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HOMEY_WEBHOOK_URL } = process.env;

const TARGET_HUB_ID = "002E5080"; // De specifieke hub voor de Gym
const API_BASE = "https://api.ajax.systems/api"; 
let sessionToken = '';
let detectedUserId = '';

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
        detectedUserId = res.data.userId; 
        console.log(`✅ Ingelogd. User ID: ${detectedUserId}`);
        
        await verifyHubAccess();
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

async function verifyHubAccess() {
    try {
        console.log(`Stap 2: Toegang tot Hub ${TARGET_HUB_ID} controleren...`);
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hubs = Array.isArray(res.data) ? res.data : (res.data.hubs || res.data.data || []);
        
        // Zoek specifiek naar jouw Gym Hub ID
        const myHub = hubs.find(h => (h.id === TARGET_HUB_ID || h.hubId === TARGET_HUB_ID));

        if (myHub) {
            console.log(`✅ Hub gevonden en geautoriseerd: ${myHub.name || 'Gym Hub'}`);
            checkStatus();
        } else {
            console.error(`❌ FOUT: Hub ${TARGET_HUB_ID} niet gevonden in de lijst van dit account!`);
            console.log("Beschikbare ID's in dit account:", hubs.map(h => h.id || h.hubId));
            // We proberen het toch met het opgegeven ID, voor het geval de lijst-API beperkt is
            checkStatus(); 
        }
    } catch (err) {
        console.error("❌ Discovery Fout:", err.response?.status, JSON.stringify(err.response?.data));
        // Forceer start als discovery faalt maar login gelukt is
        checkStatus();
    }
}

async function checkStatus() {
    try {
        // We gebruiken nu geforceerd het juiste TARGET_HUB_ID
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 
                'X-Session-Token': sessionToken, 
                'X-Api-Key': AJAX_X_API_KEY 
            }
        });

        const hub = res.data;
        
        const statusReport = {
            alarm: hub.armedState || "UNKNOWN",
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`🚀 Update naar Homey [Hub ${TARGET_HUB_ID}]: ${statusReport.alarm}`);
        
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error(`❌ Status Fout [${err.response?.status}]:`, err.response?.data);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}

login();
