let map,
    userMarker,
    stopsLayer = L.layerGroup();

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

function bboxFromMap() {
    // Overpass bbox order: south,west,north,east
    const b = map.getBounds();
    return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(",");
}
async function loadStopTimes(stop) {
    const now = new Date().toISOString();
    const url = `'https://birch.catenarymaps.org/departures_at_osm_station?osm_station_id=${stop}&include_shapes=false`;
    const options = { method: "GET" };
    console.log(url);

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        console.log(data);
        console.log(data.osm_station.name);
    } catch (error) {
        console.error(error);
    }
}
// Query only for station-type nodes (fast + all you need for point mapping).
// Ways/relations from your original query are for route geometry, not needed here.
function buildQuery(bbox) {
    return `[out:json][timeout:90][bbox:${bbox}];
(
  node[railway~"^(station|halt|stop|tram_stop)$"];
  node[public_transport=station];
);
out body;`;
}

async function loadStops() {
    const bbox = bboxFromMap();
    const query = buildQuery(bbox);

    let data;
    try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: "data=" + encodeURIComponent(query)
        });
        data = await res.json();
    } catch (err) {
        console.error("Overpass fetch failed:", err);
        return;
    }

    stopsLayer.clearLayers();

    for (const el of data.elements) {
        if (el.type !== "node") continue;
        const tags = el.tags || {};
        const name = tags.name || "(unnamed station)";
        const mode = tags.railway || tags.public_transport || "station";

        const marker = L.circleMarker([el.lat, el.lon], {
            radius: 6,
            color: "#e63946",
            fillColor: "#e63946",
            fillOpacity: 0.85,
            weight: 1.5
        });

        marker.bindPopup(
            `<div class="station-popup"><strong>${escapeHtml(name)}</strong><br>${escapeHtml(mode)}</div>`
        );

        marker.addTo(stopsLayer);
    }
}

function escapeHtml(str) {
    return String(str).replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[c]
    );
}

// Example: start centered on downtown LA
initMap(34.0522, -118.2437);
loadStopTimes(268547062);
