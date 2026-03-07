const axios = require('axios');

const {
    AJAX_LOGIN,
    AJAX_PASSWORD,
    AJAX_X_API_KEY,
    HUB_ID,
    USER_ID,
    HOMEY_WEBHOOK_URL
} = process.env;

// Exacte Base URL volgens jouw info
const API_BASE = "https://api.ajax.systems/api"; 

let sessionToken = '';

async function login() {
    try {
        console.log("Poging inloggen op:", `${API_BASE}/login`);
        
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            password: AJAX_PASSWORD
        }, {
            headers: { 
                'X-Api-Key': AJAX_X_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        sessionToken = res.data.sessionToken;
        console.log("✅ Succesvol ingelogd bij Ajax Enterprise.");
        checkStatus();
    } catch (err) {
        console.error("❌ Login Error:", err.response?.status, err.response?.data || err.message);
        // Bij een 404 hier: probeer in de URL 'https://api.ajax.systems/api/v1/login' (sommige accounts vereisen dit alsnog)
        setTimeout(login, 60000); 
    }
}

async function checkStatus() {
    if (!sessionToken) return login();

    try {
        // We proberen de status van de Hub op te halen
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

        console.log("Status update naar Homey:", statusReport.alarm);

        // Webhook naar Homey
        await axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`);

    } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
            console.log("Sessie ongeldig, herinloggen...");
            sessionToken = '';
        } else {
            console.error("❌ Status Check Error:", err.response?.status, err.response?.data || err.message);
        }
    }
    
    setTimeout(checkStatus, 30000);
}

login();
