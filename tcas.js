
// 
// ______________________________________-
//  T C A S 2 4     J s C o d e 
// ________________________________________-
//
//
//


const canvas = document.getElementById("tcasCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const connectBtn = document.getElementById("connectBtn");
const pilotSelect = document.getElementById("pilotSelect");
const toggleInfoBtn = document.getElementById("toggleInfo");
const toggleGroundBtn = document.getElementById("toggleGround");
// <><><>
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const alertBanner = document.getElementById("alertBanner");
const debugPanel = document.getElementById("debugPanel");
const toggleDebugBtn = document.getElementById("toggleDebugBtn");
const closeDebugBtn = document.getElementById("closeDebugBtn");
const rawStream = document.getElementById("rawStream");
const procStream = document.getElementById("procStream");


let ws = null;
let liveTraffic = {};
let lastValidTraffic = {};
let lastValidOwnship = null;
let zoomFactor = 0.015;
let viewHeading = 0;
let showInfo = false;
let showGround = false;

let debugVisible = false;
let ownshipCallsign = null;
let lastAltitudes = {};
let lastThreats = {};
let lastUpdateTime = 0;
let welcomeShown = false;
const DATA_TIMEOUT = 500000;


const studsPerNm = 3307.14286; // according to https://discord.com/channels/1361874697410711723/1395897343433375764/1395897469950361773
const THREAT_COLORS = {
    NONE: "#ffffff",
    PROX: "#ffffff",
    TA: "#ffff00",
    RA: "#ff0000"
};


function initializeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}
initializeCanvas();
window.addEventListener("resize", initializeCanvas);

////////////////
function updateDisplayValues() {
    if (!ownshipCallsign) {
        document.getElementById("ownAlt").textContent = "--";
        document.getElementById("ownHeading").textContent = "---°";
        document.getElementById("ownSpeed").textContent = "---";
        return;
    }
    
    const dataToUse = liveTraffic.d ? liveTraffic : lastValidTraffic;
    let ownship = null;
    
    if (dataToUse.d && dataToUse.d[ownshipCallsign]) {
        ownship = dataToUse.d[ownshipCallsign];
        lastValidOwnship = ownship; 
    } else if (lastValidOwnship) {
        ownship = lastValidOwnship; 
    }
    
    if (!ownship) {
        document.getElementById("ownAlt").textContent = "--";
        document.getElementById("ownHeading").textContent = "---°";
        document.getElementById("ownSpeed").textContent = "---";
        return;
    }
    
    
    document.getElementById("ownAlt").textContent = Math.round(ownship.altitude || 0).toString();
    document.getElementById("ownHeading").textContent = Math.round(ownship.heading || 0).toString().padStart(3, "0") + "°";
    document.getElementById("ownSpeed").textContent = Math.round(ownship.groundSpeed || ownship.speed || 0).toString();
    document.getElementById("mapHeading").textContent = viewHeading.toString().padStart(3, "0") + "°";
}


connectBtn.onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        connectBtn.textContent = "CONNECT";
        connectBtn.classList.remove("connected");
        document.getElementById("statusIndicator").classList.remove("active");
        document.getElementById("statusText").textContent = "STANDBY";
        document.getElementById("connStatus").textContent = "DISCONNECTED";
        alertBanner.classList.remove("active");
        lastValidOwnship = null;
        return;
    }

    ws = new WebSocket("wss://ws.awdevsoftware.org");

    ws.onopen = () => {
        connectBtn.textContent = "DISCONNECT";
        connectBtn.classList.add("connected");
        document.getElementById("statusIndicator").classList.add("active");
        document.getElementById("statusText").textContent = "CONNECTED";
        document.getElementById("connStatus").textContent = "CONNECTED";
        lastUpdateTime = Date.now();
        
        
        if (!welcomeShown) {
            showWelcomeNotification();
            welcomeShown = true;
        }
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        procStream.textContent = "Connection error: " + error.message;
        document.getElementById("connStatus").textContent = "Error please ensure your device can connect to wss://ws.awdevsoftware.org";
    };

    ws.onclose = () => {
        connectBtn.textContent = "CONNECT";
        connectBtn.classList.remove("connected");
        document.getElementById("statusIndicator").classList.remove("active");
        document.getElementById("statusText").textContent = "STANDBY";
        document.getElementById("connStatus").textContent = "DISCONNECTED";
    };

    ws.onmessage = async (msg) => {
        try {
            let text = msg.data instanceof Blob ? await msg.data.text() : msg.data;
            rawStream.textContent = text.substring(0, 800);

            let incoming;
            try {
                incoming = JSON.parse(text);
            } catch (e) {
                procStream.textContent = "Error, please refresh and try again otherwise contact @istmc0 (Discord) or this repo GitHub";
                console.warn("JSON parsing error:", e);
                return;
            }

            if (!incoming || typeof incoming !== 'object' || !incoming.d) {
                return;
            }

            if (Object.keys(incoming.d).length === 0) {
                return;
            }

            lastValidTraffic = incoming;
            liveTraffic = incoming;
            lastUpdateTime = Date.now();

            if (!ownshipCallsign) {
                populatePilotDropdown();
            }
            
            document.getElementById("aircraftCount").textContent = Object.keys(incoming.d).length.toString();
            document.getElementById("lastUpdate").textContent = new Date().toLocaleTimeString();
        } catch (e) {
            console.error("Message handling error, please contact @istmc0 (Discord) or GitHub repo:", e);
        }
    };
};


function populatePilotDropdown() {
    const dataToUse = liveTraffic.d ? liveTraffic : lastValidTraffic;
    if (!dataToUse.d) return;

    pilotSelect.innerHTML = `<option value="">Select Aircraft</option>`;

    for (const callsign in dataToUse.d) {
        const ac = dataToUse.d[callsign];
        if (!ac.playerName) continue;

        const opt = document.createElement("option");
        opt.value = callsign;
        opt.textContent = ac.playerName + " (" + callsign + ")";
        pilotSelect.appendChild(opt);
    }
}

pilotSelect.onchange = () => {
    ownshipCallsign = pilotSelect.value || null;
};


zoomInBtn.onclick = () => {
    zoomFactor = Math.min(zoomFactor * 1.2, 0.2);
    updateZoomDisplay();
};

zoomOutBtn.onclick = () => {
    zoomFactor = Math.max(zoomFactor / 1.2, 0.0045);
    updateZoomDisplay();
};


function updateZoomDisplay() {
    const zoomLevel = (zoomFactor / 0.015).toFixed(1);
    document.getElementById("zoomDisplay").textContent = zoomLevel + "x";
}


canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomFactor *= (e.deltaY > 0 ? 1.1 : 0.9);
    zoomFactor = Math.max(0.0045, Math.min(zoomFactor, 0.2));
    updateZoomDisplay();
});


toggleInfoBtn.onchange = () => { showInfo = toggleInfoBtn.checked; };
toggleGroundBtn.onchange = () => { showGround = toggleGroundBtn.checked; };



toggleDebugBtn.onclick = () => {
    debugVisible = !debugVisible;
    debugPanel.classList.toggle("active", debugVisible);
};

closeDebugBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    debugVisible = false;
    debugPanel.classList.remove("active");
    return false;
};


function classifyThreat(distNm, altDiff, isOnGround) {
    if (isOnGround) return "NONE";
    if (distNm < 3 && Math.abs(altDiff) < 600) return "RA";
    if (distNm < 6 && Math.abs(altDiff) < 850) return "TA";
    if (distNm < 6 && Math.abs(altDiff) < 1200) return "PROX";
    return "NONE";
}


function cleanupOldAircraft(currentCallsigns) {
    for (const callsign in lastAltitudes) {
        if (!currentCallsigns.has(callsign)) {
            delete lastAltitudes[callsign];
            delete lastThreats[callsign];
        }
    }
}


function drawAircraftSymbol(px, py, threat, heading, vs, size = 12) {
    ctx.save();
    ctx.translate(px, py);
    
    const color = THREAT_COLORS[threat] || "#ffffff";
    ctx.strokeStyle = color;
    ctx.fillStyle = threat === "NONE" ? "transparent" : color;
    ctx.lineWidth = 2;

    
    if (threat === "RA") {
        
        ctx.beginPath();
        ctx.moveTo(-size, -size);
        ctx.lineTo(size, -size);
        ctx.lineTo(size, size);
        ctx.lineTo(-size, size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (threat === "TA") {
        
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.stroke();
        if (threat !== "NONE") ctx.fill();
    } else {
        
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size, 0);
        ctx.closePath();
        ctx.stroke();
        if (threat !== "NONE") ctx.fill();
    }
    
    
    if (vs !== undefined && heading !== undefined && heading !== null) {
        ctx.save();
        ctx.rotate(heading * Math.PI / 180);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -size - 5);
        ctx.lineTo(-2, -size - 10);
        ctx.lineTo(2, -size - 10);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}


function drawOwnship(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "#ffff00";
    ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
    ctx.lineWidth = 2;

    
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(15, 15);
    ctx.lineTo(-15, 15);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}


function drawRangeRings(cx, cy) {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    const ranges = [3, 6, 12];
    for (const nm of ranges) {
        const r = (nm * studsPerNm) * zoomFactor;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();

        
        ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
        ctx.font = "bold 12px 'Courier New'";
        ctx.textAlign = "center";
        const labelX = cx - r * 0.75;
        const labelY = cy - r * 0.75;
        ctx.fillText(nm.toString(), labelX, labelY);
    }

    ctx.restore();
}


function drawHeadingTape(cx, cy, width) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1.5;

    const rArc = width * 0.35;

    ctx.beginPath();
    ctx.arc(cx, cy, rArc, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    
    for (let hdg = 0; hdg < 360; hdg += 10) {
        let rel = ((hdg - viewHeading + 540) % 360) - 180;
        if (rel < -70 || rel > 70) continue;

        const rad = (rel - 90) * Math.PI / 180;
        const tx = cx + Math.cos(rad) * (rArc + 25);
        const ty = cy + Math.sin(rad) * (rArc + 25);

        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "12px 'Courier New'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(hdg.toString().padStart(3, "0"), tx, ty);
    }

    
    ctx.fillStyle = "#ffff00";
    ctx.font = "bold 14px 'Courier New'";
    const northRad = (0 - viewHeading - 90) * Math.PI / 180;
    const northX = cx + Math.cos(northRad) * (rArc + 35);
    const northY = cy + Math.sin(northRad) * (rArc + 35);
    ctx.fillText("N", northX, northY);

    ctx.restore();
}

//  in next update ensure validity of all radar tracking data
function drawTraffic(cx, cy) {
    const dataToUse = liveTraffic.d ? liveTraffic : lastValidTraffic;
    const processed = {};

    if (!dataToUse.d) {
        procStream.textContent = "{}";
        return;
    }

    if (!ownshipCallsign) {
        procStream.textContent = "{}";
        return;
    }
    
    
    let ownshipData = null;
    if (dataToUse.d[ownshipCallsign]) {
        ownshipData = dataToUse.d[ownshipCallsign];
        lastValidOwnship = ownshipData;
    } else if (lastValidOwnship) {
        ownshipData = lastValidOwnship;
    }
    
    if (!ownshipData || !ownshipData.position) {
        return;
    }

    let ownX = ownshipData.position.x;
    let ownY = ownshipData.position.y;
    let ownAlt = ownshipData.altitude || 0;

    const activeCallsigns = new Set();
    const threats = [];

    for (const callsign in dataToUse.d) {
        const ac = dataToUse.d[callsign];
        activeCallsigns.add(callsign);

        if (!ac.position || typeof ac.position.x !== 'number' || typeof ac.position.y !== 'number') continue;
        if (callsign === ownshipCallsign) continue;
        if (ac.isOnGround === true && !showGround) continue;

        const relX = ac.position.x - ownX;
        const relY = ac.position.y - ownY;
        const distStuds = Math.sqrt(relX * relX + relY * relY);
        const distNm = distStuds / studsPerNm;

        const altFt = ac.altitude || 0;
        const altDiff = altFt - ownAlt;
        const hundreds = Math.round(altDiff / 100);

        const rad = (-viewHeading) * Math.PI / 180;
        const rotX = relX * Math.cos(rad) - relY * Math.sin(rad);
        const rotY = relX * Math.sin(rad) + relY * Math.cos(rad);

        const px = cx + rotX * zoomFactor;
        const py = cy - rotY * zoomFactor;

        processed[callsign] = { 
            relX, relY, px, py, distNm, altDiff,
            playerName: ac.playerName,
            aircraftType: ac.aircraftType,
            heading: ac.heading,
            wind: ac.wind,
            isEmergency: ac.isEmergencyOccuring
        };

        let vs = 0;
        if (lastAltitudes[callsign] !== undefined) {
            vs = altFt - lastAltitudes[callsign];
        }
        lastAltitudes[callsign] = altFt;

        const threat = classifyThreat(distNm, altDiff, ac.isOnGround === true);
        
        if (threat !== lastThreats[callsign]) {
            if (threat === "TA") {
                showAlert("TRAFFIC", "threat-ta");
                speakAlert("Traffic");
            } else if (threat === "RA") {
                const raText = vs > 0 ? "CLIMB" : "DESCEND";
                showAlert(raText, "threat-ra");
                speakAlert(raText);
            }
        }
        lastThreats[callsign] = threat;

        
        const maxRadiusNm = 1 / (zoomFactor / 0.015) * 2;
        if (distNm <= maxRadiusNm && px > 50 && px < canvas.width - 50 && py > 50 && py < canvas.height - 50) {
            const heading = ac.heading || 0;
            drawAircraftSymbol(px, py, threat, heading, vs);

            
            const trend = vs > 30 ? "↑" : (vs < -30 ? "↓" : "");
            const altText = (hundreds > 0 ? "+" : "") + hundreds + (trend ? " " + trend : "");

            ctx.save();
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 12px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText(altText, px, py + 28);

            
            if (showInfo) {
                ctx.font = "10px 'Courier New'";
                ctx.fillStyle = "#00d4ff";
                ctx.textAlign = "left";
                ctx.fillText(callsign, px + 18, py - 12);
                ctx.fillText(ac.aircraftType || "---", px + 18, py - 2);
                ctx.fillText("ALT " + Math.round(altFt), px + 18, py + 8);
                ctx.fillText("SPD " + Math.round(ac.groundSpeed || ac.speed || 0), px + 18, py + 18);
                
                
                if (ac.isEmergencyOccuring) {
                    ctx.fillStyle = "#ff0000";
                    ctx.font = "bold 10px 'Courier New'";
                    ctx.fillText("Aircraft in Emergency", px + 18, py + 28);
                }
            }

            ctx.restore();

            if (threat !== "NONE") {
                threats.push({ callsign, threat, distNm, altDiff, playerName: ac.playerName });
            }
        }
    }

    
    const threatsList = document.getElementById("threatsList");
    threatsList.innerHTML = threats.length === 0 ? "<div style='color: #00aa00;'>No active threats</div>" : threats.map(t => 
        `<div class="threat-entry ${t.threat.toLowerCase()}">
            <strong>${t.callsign}</strong> (${t.playerName})<br/>
            ${t.threat} | Dist: ${t.distNm.toFixed(1)}nm<br/>
            Alt: ${t.altDiff > 0 ? '+' : ''}${Math.round(t.altDiff)}ft
        </div>`
    ).join("");

    procStream.textContent = JSON.stringify(processed, null, 2);
    cleanupOldAircraft(activeCallsigns);
}


function showAlert(text, className) {
    alertBanner.textContent = text;
    alertBanner.className = "alert-banner active " + className;
    setTimeout(() => {
        if (alertBanner.className.includes(className)) {
            alertBanner.classList.remove("active");
        }
    }, 2000);
}


function showWelcomeNotification() {
    const welcomeMsg = document.createElement("div");
    welcomeMsg.className = "welcome-notification";
    welcomeMsg.textContent = "✅ Connected to the WebSocket";
    welcomeMsg.style.cssText = `
        position: fixed;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 255, 0, 0.2);
        border: 2px solid #00ff00;
        color: #00ff00;
        padding: 12px 24px;
        font-family: 'Courier New', monospace;
        font-weight: bold;
        font-size: 14px;
        z-index: 1001;
       
        animation: introFade2 1s ease-in-out;
    `;
    document.body.appendChild(welcomeMsg);
    
    setTimeout(() => {
        welcomeMsg.style.animation = "introFade2 0.5s ease-in-out reverse";
        setTimeout(() => welcomeMsg.remove(), 500);
    }, 1000);
}


function speakAlert(text) {
    try {
        if (speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.3;
            utterance.pitch = 1;
            speechSynthesis.cancel();
            speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.warn("A problem has arisen please notify @istmc0 (Discord) or GitHub of this issue", e);
    }
}


function draw() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const cx = width / 2;
    const cy = height / 2;

    
    const timeSinceUpdate = Date.now() - lastUpdateTime;
    if (timeSinceUpdate > DATA_TIMEOUT && Object.keys(lastValidTraffic).length > 0) {
        liveTraffic = lastValidTraffic;
    }

    
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    
    drawRangeRings(cx, cy);
    drawHeadingTape(cx, cy, width);
    drawOwnship(cx, cy);
    drawTraffic(cx, cy);
    
    updateDisplayValues();

    requestAnimationFrame(draw);
}
draw();


window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    
    if (key === "i") {
        e.preventDefault();
        showInfo = !showInfo;
        toggleInfoBtn.checked = showInfo;
    }
    if (key === "g") {
        e.preventDefault();
        showGround = !showGround;
        toggleGroundBtn.checked = showGround;
    }
    if (key === "x") {
        e.preventDefault();
        debugVisible = !debugVisible;
        debugPanel.classList.toggle("active", debugVisible);
    }
    if (key === "a") {
        e.preventDefault();
        viewHeading = (viewHeading - 5 + 360) % 360;
        updateHeadingDisplay();
    }
    if (key === "d") {
        e.preventDefault();
        viewHeading = (viewHeading + 5) % 360;
        updateHeadingDisplay();
    }
});


function updateHeadingDisplay() {
    document.getElementById("mapHeading").textContent = viewHeading.toString().padStart(3, "0") + "°";
}


document.getElementById("zoomDisplay").textContent = "1.0x";
