const axios = require('axios');

// De variabelen worden uit Railway 'Variables' gehaald
const {
    AJAX_LOGIN,
    AJAX_PASSWORD,
    AJAX_X_API_KEY,
    HUB_ID,
    USER_ID,
    HOMEY_WEBHOOK_URL
} = process.env;

const API_BASE = "https://api.ajax.systems/api/v1";
let sessionToken = '';

async function login() {
    try {
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            password: AJAX_PASSWORD
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY }
        });
        sessionToken = res.data.sessionToken;
        console.log("Sessie gestart bij Ajax.");
        
        // Direct eerste check uitvoeren
        checkStatus();
    } catch (err) {
        console.error("Login Error:", err.response?.data || err.message);
        setTimeout(login, 60000); // Probeer opnieuw na 1 minuut bij fout
    }
}

async function checkStatus() {
    if (!sessionToken) return login();

    try {
        // Gebruik het endpoint uit jouw documentatie voor gedetailleerde hub info
        const res = await axios.get(`${API_BASE}/user/${USER_ID}/hubs/${HUB_ID}`, {
            headers: { 
                'X-Session-Token': sessionToken,
                'X-Api-Key': AJAX_X_API_KEY
            }
        });

        const hub = res.data;

        // Pakketje samenstellen voor Homey
        const statusReport = {
            alarm: hub.armedState,                  // ARMED / DISARMED
            online: hub.online ? "JA" : "NEE",      // Verbinding status
            brand: hub.fireAlarm ? "BRAND!" : "OK", // Branddetectie
            co: hub.coAlarm ? "GAS!" : "OK",        // CO detectie
            sabotage: hub.tamper ? "ALARM" : "OK"   // Sabotage/Tamper
        };

        console.log("Status verzonden naar Homey:", statusReport);

        // Verstuur naar Homey via Webhook
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`);

    } catch (err) {
        if (err.response?.status === 401) {
            console.log("Sessie verlopen, opnieuw inloggen...");
            sessionToken = '';
        } else {
            console.error("Check Error:", err.message);
        }
    }
    
    // Interval van 30 seconden (aanpasbaar)
    setTimeout(checkStatus, 30000);
}

// Start het script
login();
