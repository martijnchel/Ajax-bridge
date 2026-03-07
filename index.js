const axios = require('axios');
const crypto = require('crypto');

// Variabelen uit Railway Environment
const {
    AJAX_LOGIN,
    AJAX_PASSWORD,
    AJAX_X_API_KEY,
    HUB_ID,
    USER_ID,
    HOMEY_WEBHOOK_URL
} = process.env;

const API_BASE = "https://api.ajax.systems/api"; 
let sessionToken = '';

// Functie om het wachtwoord te hashen naar SHA-256 (vereist door Ajax)
function createHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function login() {
    try {
        console.log("Poging inloggen bij Ajax...");
        const passwordHash = createHash(AJAX_PASSWORD);
        
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: passwordHash
        }, {
            headers: { 
                'X-Api-Key': AJAX_X_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        sessionToken = res.data.sessionToken;
        console.log("✅ Succesvol ingelogd bij Ajax.");
        checkStatus();
    } catch (err) {
        console.error("❌ Login Error:", err.response?.status, JSON.stringify(err.response?.data, null, 2));
        // Bij fout: probeer over 60 seconden opnieuw
        setTimeout(login, 60000); 
    }
}

async function checkStatus() {
    if (!sessionToken) return login();

    try {
        // Haal gedetailleerde Hub informatie op
        const res = await axios.get(`${API_BASE}/user/${USER_ID}/hubs/${HUB_ID}`, {
            headers: { 
                'X-Session-Token': sessionToken,
                'X-Api-Key': AJAX_X_API_KEY
            }
        });

        const hub = res.data;

        // Vertaling naar begrijpelijke status voor Homey
        const statusReport = {
            alarm: hub.armedState,                  // ARMED / DISARMED
            online: hub.online ? "JA" : "NEE",
            brand: hub.fireAlarm ? "BRAND!" : "OK",
            co: hub.coAlarm ? "GAS!" : "OK",
            sabotage: hub.tamper ? "ALARM" : "OK"
        };

        console.log(`Update verzonden: Alarm=${statusReport.alarm}, Online=${statusReport.online}`);

        // Verstuur data naar Homey
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`);

    } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
            console.log("Sessie verlopen, herinloggen...");
            sessionToken = '';
            login();
        } else {
            console.error("❌ Status Check Error:", err.response?.status, err.message);
            // Probeer het over 30 seconden gewoon opnieuw
            setTimeout(checkStatus, 30000);
        }
    }
    
    // Polling interval (30 seconden is veilig voor de API limieten)
    setTimeout(checkStatus, 30000);
}

// Start het proces
if (!AJAX_LOGIN || !AJAX_PASSWORD || !AJAX_X_API_KEY) {
    console.error("❌ FOUT: Niet alle variabelen zijn ingesteld in Railway!");
} else {
    login();
}
