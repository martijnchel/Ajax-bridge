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
        detectedUserId = res.data.userId; 
        console.log(`✅ Ingelogd. User ID: ${detectedUserId}`);
        
        await discoverHub();
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.data || err.message);
        setTimeout(login, 60000);
    }
}

async function discoverHub() {
    try {
        console.log("Stap 2: Hubs zoeken...");
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        // Ajax geeft soms een array direct, of een object met een 'hubs' of 'data' veld
        const hubs = Array.isArray(res.data) ? res.data : (res.data.hubs || res.data.data || []);

        if (hubs.length > 0) {
            // We zoeken naar 'id' of 'hubId'
            const firstHub = hubs[0];
            detectedHubId = firstHub.id || firstHub.hubId;
            const hubName = firstHub.name || "Naamloze Hub";

            if (detectedHubId) {
                console.log(`✅ Hub gevonden: ${hubName} (ID: ${detectedHubId})`);
                checkStatus();
            } else {
                console.error("❌ Hub gevonden, maar geen ID gevonden in data:", firstHub);
            }
        } else {
            console.error("❌ Geen hubs gevonden voor dit account. Check de Ajax App rechten.");
            setTimeout(discoverHub, 60000);
        }
    } catch (err) {
        console.error("❌ Discovery Fout:", err.response?.status, JSON.stringify(err.response?.data));
    }
}

async function checkStatus() {
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${detectedHubId}`, {
            headers: { 
                'X-Session-Token': sessionToken, 
                'X-Api-Key': AJAX_X_API_KEY 
            }
        });

        const hub = res.data;
        
        // De 422 error kwam waarschijnlijk door een verkeerd Hub-ID pad. 
        // Nu we het juiste ID hebben, bouwen we het rapport:
        const statusReport = {
            alarm: hub.armedState || "UNKNOWN",
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`🚀 Update naar Homey: ${statusReport.alarm}`);
        
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
