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
        console.log("Inloggen bij Ajax Cloud...");
        const res = await axios.post(`${API_BASE}/login`, {
            login: AJAX_LOGIN,
            passwordHash: createHash(AJAX_PASSWORD)
        }, {
            headers: { 'X-Api-Key': AJAX_X_API_KEY, 'Content-Type': 'application/json' }
        });
        sessionToken = res.data.sessionToken;
        detectedUserId = res.data.userId; 
        console.log("✅ Verbinding gemaakt.");
        checkStatus();
    } catch (err) {
        console.error("❌ Login Fout:", err.message);
        setTimeout(login, 60000);
    }
}

async function checkStatus() {
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;

        // 1. Alarm status (NIGHT_MODE, ARMED, DISARMED)
        const currentAlarm = hub.state || "DISARMED";

        // 2. Online status (Check of kanalen actief zijn)
        const isOnline = (hub.activeChannels && hub.activeChannels.length > 0);

        // 3. Sabotage (Tamper) - Check of er storingen/malfunctions zijn
        const isTampered = (hub.hubMalfunctions && hub.hubMalfunctions.length > 0);

        // 4. Brand & CO (Check fireAlarm object uit jouw debug data)
        // We mappen dit naar de Enums die je Homey script begrijpt
        const smokeStatus = (hub.fireAlarm && hub.fireAlarm.state === "ALARM") 
            ? "SMOKE_ALARM_DETECTED" 
            : "SMOKE_ALARM_NOT_DETECTED";

        const coStatus = (hub.coAlarm && hub.coAlarm.state === "ALARM")
            ? "CO_ALARM_DETECTED"
            : "CO_ALARM_NOT_DETECTED";

        const statusReport = {
            alarm: currentAlarm,
            online: isOnline ? "ONLINE" : "OFFLINE",
            brand: smokeStatus,
            co: coStatus,
            sabotage: isTampered ? "TAMPERED_FRONT_OPEN" : "TAMPERED_FRONT_OK"
        };

        console.log(`🚀 VERZONDEN: [${statusReport.alarm}] [Online: ${statusReport.online}] [Brand: ${isTampered ? 'SABOTAGE!' : 'OK'}]`);
        
        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error("Fout bij ophalen status:", err.message);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}

login();
