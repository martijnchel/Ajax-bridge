const axios = require('axios');
const crypto = require('crypto');

const {
    AJAX_LOGIN, AJAX_PASSWORD, AJAX_X_API_KEY, HUB_ID, USER_ID, HOMEY_WEBHOOK_URL
} = process.env;

const API_BASE = "https://api.ajax.systems/api"; 
let sessionToken = '';
let isLoggingIn = false;

function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function login() {
    if (isLoggingIn) return;
    isLoggingIn = true;
    
    try {
        console.log("Sessie opbouwen bij Ajax...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        
        sessionToken = res.data.sessionToken;
        console.log("✅ Succesvol ingelogd.");
        isLoggingIn = false;
        
        // Wacht 2 seconden voor de eerste check om de API rust te geven
        setTimeout(checkStatus, 2000);
    } catch (err) {
        console.error("❌ Login Fout:", err.response?.status, err.response?.data || err.message);
        isLoggingIn = false;
        setTimeout(login, 60000); 
    }
}

async function checkStatus() {
    if (!sessionToken) return;

    try {
        const res = await axios.get(`${API_BASE}/user/${USER_ID}/hubs/${HUB_ID}`, {
            headers: { 
                'X-Session-Token': sessionToken,
                'X-Api-Key': AJAX_X_API_KEY
            }
        });

        const hub = res.data;
        const statusReport = {
            alarm: hub.armedState,
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`Update verzonden: ${statusReport.alarm}`);
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`);

        // Plan de volgende check
        setTimeout(checkStatus, 30000);

    } catch (err) {
        const status = err.response?.status;
        console.error(`❌ Status Check Error [${status}]:`, err.response?.data || err.message);

        if (status === 401 || status === 403) {
            console.log("Sessie niet geaccepteerd. Controleren van USER_ID of HUB_ID...");
            sessionToken = '';
            setTimeout(login, 5000);
        } else {
            setTimeout(checkStatus, 30000);
        }
    }
}

login();
