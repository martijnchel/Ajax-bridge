/**
 * Ajax Systems naar Homey Master Script
 * Versie: 3.0 (Met API Update & Inverted Online Check)
 */

// 1. Ontvang de data van de Webhook
if (!args || !args[0]) {
    console.error("❌ Geen data ontvangen van Railway.");
    return false;
}

const data = JSON.parse(args[0]);
console.log("📥 Ontvangen data:", data);

// 2. Haal alle variabelen en apparaten op
const allVars = await Homey.logic.getVariables();
const devices = await Homey.devices.getDevices();
const myDevice = Object.values(devices).find(d => d.name === 'YV alarm');

// 3. Vertaling van Ajax naar jouw True/False tekstvariabelen
// Let op: ajax_online staat nu op 'true' als de verbinding WEG is (waarschuwing)
const mapping = {
    'ajax_brand': String(data.brand === "SMOKE_ALARM_DETECTED"),
    'ajax_co': String(data.co === "CO_ALARM_DETECTED"),
    'ajax_sabotage': String(data.sabotage === "TAMPERED_FRONT_OPEN"),
    'ajax_nacht': String(data.alarm === "NIGHT_MODE"),
    'ajax_alarm': String(data.alarm === "ARMED"),
    'ajax_online': String(data.online !== "ONLINE") 
};

// 4. Werk de tekstvariabelen bij in Homey Logica
for (const [varName, value] of Object.entries(mapping)) {
    const myVar = Object.values(allVars).find(v => v.name === varName);
    
    if (myVar) {
        // Gebruik de updateVariable methode (Correct voor Homey Script)
        await Homey.logic.updateVariable({
            id: myVar.id,
            variable: { value: value }
        });
        console.log(`✅ Logica: ${varName} -> ${value}`);
    } else {
        console.log(`⚠️ Variabele niet gevonden: ${varName}`);
    }
}

// 5. Werk de status van het Virtuele Apparaat bij (YV alarm)
if (myDevice) {
    let state = "disarmed"; 
    if (data.alarm === "ARMED") {
        state = "armed";
    } else if (data.alarm === "NIGHT_MODE") {
        state = "partially_armed";
    }

    try {
        // We gebruiken force:true om de status van de sensor te overschrijven
        await myDevice.setCapabilityValue('homealarm_state', state, { "force": true });
        console.log(`✅ Dashboard: YV alarm staat nu op '${state}'`);
    } catch (e) {
        console.error("❌ Apparaat fout:", e.message);
    }
} else {
    console.error("❌ Fout: Apparaat 'YV alarm' niet gevonden.");
}

return true;
