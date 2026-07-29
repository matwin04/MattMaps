// --- Theme (light/dark) ---

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    const btn = document.getElementById("theme-toggle");
    const icon = btn?.querySelector("i");

    if (icon) {
        icon.className = theme === "dark" ? "mdi mdi-white-balance-sunny" : "mdi mdi-weather-night";
    }
}

function initTheme() {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

    applyTheme(stored || (prefersDark ? "dark" : "light"));
}

document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    applyTheme(next);
    localStorage.setItem("theme", next);
});

initTheme();

let map;
let userMarker;
let stopsLayer = L.layerGroup();

// Icon + color per transit mode (MDI icon classes are already loaded via styles.css)
const MODE_META = {
    AIRPLANE: { icon: "mdi-airplane", color: "#7c3aed" },
    NIGHT_RAIL: { icon: "mdi-train-variant", color: "#1e293b" },
    HIGHSPEED_RAIL: { icon: "mdi-bullet-train-side", color: "#dc2626" },
    LONG_DISTANCE: { icon: "mdi-train", color: "#0891b2" },
    COACH: { icon: "mdi-bus-articulated-front", color: "#9333ea" },
    REGIONAL_RAIL: { icon: "mdi-train", color: "#2563eb" },
    SUBURBAN: { icon: "mdi-train-car", color: "#0d9488" },
    FERRY: { icon: "mdi-ferry", color: "#0284c7" },
    SUBWAY: { icon: "mdi-subway-variant", color: "#ea580c" },
    TRAM: { icon: "mdi-tram", color: "#16a34a" },
    BUS: { icon: "mdi-bus", color: "#ff6600" },
    FUNICULAR: { icon: "mdi-gondola", color: "#78350f" },
    AERIAL_LIFT: { icon: "mdi-gondola", color: "#a16207" }
};
const DEFAULT_MODE_META = { icon: "mdi-map-marker", color: "#555555" };

function createStopMarkerStyle(grouped) {
    return {
        radius: grouped ? 5 : 7,
        color: grouped ? "#555" : "#ff6600",
        fillColor: grouped ? "#555" : "#ff6600",
        fillOpacity: 0.9,
        weight: 2
    };
}

function initMap(lat, lon) {
    map = L.map("map").setView([lat, lon], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 20
    }).addTo(map);

    stopsLayer.addTo(map);

    userMarker = L.circleMarker([lat, lon], {
        radius: 8,
        color: "#4da3ff",
        fillColor: "#4da3ff",
        fillOpacity: 1,
        weight: 2
    }).addTo(map);

    loadStops();

    map.on("moveend", loadStops);
}

async function loadStops() {
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    const min = `${bounds.getSouth()},${bounds.getWest()}`;
    const max = `${bounds.getNorth()},${bounds.getEast()}`;

    let grouped;
    let modes;

    if (zoom >= 16) {
        // Detailed view
        grouped = false;

        modes = [
            "AIRPLANE",
            "NIGHT_RAIL",
            "HIGHSPEED_RAIL",
            "LONG_DISTANCE",
            "COACH",
            "REGIONAL_RAIL",
            "SUBURBAN",
            "FERRY",
            "SUBWAY",
            "TRAM",
            "BUS",
            "FUNICULAR",
            "AERIAL_LIFT"
        ];
    } else {
        // Wide view - no bus stops
        grouped = true;

        modes = [
            "AIRPLANE",
            "NIGHT_RAIL",
            "HIGHSPEED_RAIL",
            "LONG_DISTANCE",
            "COACH",
            "REGIONAL_RAIL",
            "SUBURBAN",
            "FERRY",
            "SUBWAY",
            "TRAM",
            "FUNICULAR",
            "AERIAL_LIFT"
        ];
    }

    const url =
        `https://api.transitous.org/api/v6/map/stops` +
        `?min=${encodeURIComponent(min)}` +
        `&max=${encodeURIComponent(max)}` +
        `&grouped=${grouped}` +
        `&modes=${modes.join(",")}`;

    console.log(url);

    try {
        const response = await fetch(url);
        const data = await response.json();

        stopsLayer.clearLayers();

        const stops = data.stops || data;

        stops.forEach((stop) => {
            const lat = stop.lat ?? stop.location?.lat;

            const lon = stop.lon ?? stop.location?.lon;

            if (!lat || !lon) return;

            const marker = L.circleMarker([lat, lon], createStopMarkerStyle(grouped));

            marker.bindTooltip(stop.name || "Stop", {
                direction: "top"
            });

            marker.on("click", function () {
                loadStopTimes({
                    id: stop.stopId,
                    name: stop.name,
                    lat: lat,
                    lon: lon
                });
            });

            marker.addTo(stopsLayer);
        });

        console.log(`Zoom ${zoom}: Loaded ${stops.length} stops`);
    } catch (error) {
        console.error("Transitous stops error:", error);
    }
}

async function loadStopTimes(stop) {
    const now = new Date().toISOString();
    const url =
        `https://api.transitous.org/api/v6/stoptimes` +
        `?stopId=${encodeURIComponent(stop.id)}` +
        `&time=${encodeURIComponent(now)}` +
        `&arriveBy=false` +
        `&n=10` +
        `&language=en`;

    console.log(url);
    document.getElementById("selected-stop").textContent = `${stop.name} (${stop.id})`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        const list = document.getElementById("stopTimesTable_body");

        list.innerHTML = "";

        const stopTimes = data.stopTimes || [];

        stopTimes.forEach((item) => {
            const scheduled = item.place?.scheduledDeparture;

            const realtime = item.place?.departure;

            const scheduledTime = scheduled
                ? new Date(scheduled).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit"
                  })
                : "";

            const realtimeTime = realtime
                ? new Date(realtime).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit"
                  })
                : "";

            const row = document.createElement("div");
            row.className = "departure-row";

            const routeColor = item.routeColor ? `#${item.routeColor}` : "#555";

            const modeMeta = MODE_META[item.mode] || DEFAULT_MODE_META;

            row.innerHTML = `
                <div class="departure-main">
                    <span class="route-pill" style="
                        background:${routeColor};
                        color:#${item.routeTextColor || "ffffff"};
                    ">
                        ${item.routeShortName || item.displayName}
                    </span>

                    <div class="departure-info">
                        <div class="departure-headsign">${item.headsign || ""}</div>
                        <div class="departure-sub">
                            <span class="mode-badge" style="--marker-color:${modeMeta.color}">
                                <i class="mdi ${modeMeta.icon}"></i>
                                ${item.mode ? item.mode.replaceAll("_", " ") : ""}
                            </span>
                            <span class="departure-agency">${item.agencyName || ""}</span>
                        </div>
                    </div>
                </div>

                <div class="departure-time">
                    <span class="time-scheduled">${scheduledTime}</span>
                    ${item.realTime ? `<span class="time-realtime">${realtimeTime} <i class="mdi mdi-check-circle"></i></span>` : ""}
                </div>
            `;

            list.appendChild(row);
        });
    } catch (error) {
        console.error("Stop times error:", error);
    }
}

function updateUserLocation(lat, lon) {
    document.getElementById("lat-input").value = lat;

    document.getElementById("lon-input").value = lon;

    document.getElementById("coord-label").textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    if (!map) {
        initMap(lat, lon);
    } else {
        map.setView([lat, lon], map.getZoom());

        userMarker.setLatLng([lat, lon]);
    }
}

document.getElementById("refresh-btn")?.addEventListener("click", loadStops);

document.getElementById("locate-btn")?.addEventListener("click", function () {
    navigator.geolocation.getCurrentPosition((pos) => {
        updateUserLocation(pos.coords.latitude, pos.coords.longitude);
    });
});

// Start map

initMap(34.0489, -118.2585);
