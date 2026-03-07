async function checkStatus() {
    if (!sessionToken) return;
    try {
        const res = await axios.get(`${API_BASE}/user/${detectedUserId}/hubs/${TARGET_HUB_ID}`, {
            headers: { 'X-Session-Token': sessionToken, 'X-Api-Key': AJAX_X_API_KEY }
        });

        const hub = res.data;

        // 1. Slimme check voor Connectiviteit
        // We checken hubConnectionStatus, online, en connectionState
        let isOnline = (hub.online === true || hub.hubConnectionStatus === 'ONLINE' || hub.connectionState === 'ONLINE');

        // 2. Slimme check voor Alarm Status
        // We kijken naar armedState, maar als die DISARMED is terwijl er een deeltraject actief is, pakken we die.
        let currentAlarm = hub.armedState || "DISARMED";
        
        // Als de hoofstatus DISARMED is, maar de hub geeft aan dat er groepen aan staan of nachtstand:
        if (currentAlarm === "DISARMED") {
            if (hub.nightMode === true || hub.nightMode === 'ARMED') {
                currentAlarm = "NIGHT_MODE";
            } else if (hub.groupState === 'PARTIAL' || hub.partial === true) {
                currentAlarm = "PARTIAL";
            }
        }

        const statusReport = {
            alarm: currentAlarm,
            online: isOnline ? "ONLINE" : "OFFLINE",
            brand: hub.smokeAlarm || "SMOKE_ALARM_NOT_DETECTED",
            co: hub.coAlarm || "CO_ALARM_NOT_DETECTED",
            sabotage: hub.tamperedFront || "TAMPERED_FRONT_OK"
        };

        console.log(`🚀 Update verzonden: ${statusReport.alarm} | Hub: ${statusReport.online}`);
        
        // Als het nog steeds niet klopt, loggen we de hele bups voor analyse
        if (statusReport.alarm === "DISARMED" || statusReport.online === "OFFLINE") {
            console.log("DEBUG: Volledige Hub Data:", JSON.stringify(hub));
        }

        axios.get(`${HOMEY_WEBHOOK_URL}?tag=${encodeURIComponent(JSON.stringify(statusReport))}`)
             .catch(() => {});

        setTimeout(checkStatus, 60000);
    } catch (err) {
        console.error(`❌ Status Fout [${err.response?.status}]`);
        if (err.response?.status === 401) login();
        else setTimeout(checkStatus, 60000);
    }
}
