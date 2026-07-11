// script.js
let map;
let geojsonLayer; // Loads geojson exported from OverpassTurbo
const vehicleMarkers = {};

/**
 * -----------------------------------
 * MAP
 * -----------------------------------
 */
function initMap() {
    map = L.map("map").setView([33.98, -118.25], 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    loadVehicles();
    loadGeoJSON();
    loadNearbyDepartures();
    setInterval(loadVehicles, 15000);
    setInterval(loadNearbyDepartures, 30000);
}

/**
 * -----------------------------------
 * LOAD STATIC GEOJSON
 * -----------------------------------
 */
async function loadGeoJSON() {
    try {
        const response = await fetch("data/export.geojson");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (geojsonLayer) {
            map.removeLayer(geojsonLayer);
        }
        geojsonLayer = L.geoJSON(data, {
            style(feature) {
                return {
                    color: feature.properties?.color || "#0055ff",
                    weight: 4,
                    opacity: 0.9
                };
            },
            pointToLayer(feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 5,
                    color: "#ffffff",
                    weight: 1,
                    fillColor: "#0055ff",
                    fillOpacity: 1
                });
            },
            onEachFeature(feature, layer) {
                if (feature.properties) {
                    layer.bindPopup(
                        Object.entries(feature.properties)
                            .map(([key, value]) => `<b>${key}</b>: ${value}`)
                            .join("<br>")
                    );
                }
            }
        }).addTo(map);
        // Zoom map to the GeoJSON
        map.fitBounds(geojsonLayer.getBounds());
    } catch (err) {
        console.error("Error loading GeoJSON:", err);
    }
}

/**
 * -----------------------------------
 * LOAD REALTIME VEHICLES
 * -----------------------------------
 */
async function loadVehicles() {
    try {
        const response = await fetch(
            "https://birch_rt.catenarymaps.org/get_rt_of_single_route?chateau=metro~losangeles&route_id=801&last_updated_time_ms=1779165436168"
        );
        const data = await response.json();
        const vehicles = data.vehicle_positions || {};

        Object.entries(vehicles).forEach(([vehicleId, vehicle]) => {
            if (!vehicle.position) return;
            const lat = vehicle.position.latitude;
            const lon = vehicle.position.longitude;
            const trip = vehicle.trip || {};
            const delay = trip.delay || 0;

            const popupHTML = `
        <div class="popup-title">
            Train
        </div>
        <b>Vehicle:</b> ${vehicleId}<br>
        <b>Trip:</b> ${trip.trip_id || "Unknown"}<br>
        <b>Headsign:</b> ${trip.trip_headsign || "Unknown"}<br>
        <b>Direction:</b> ${trip.direction_id ?? "Unknown"}<br>
        <b>Start Time:</b> ${trip.start_time || "Unknown"}<br>
        <b>Delay:</b>
        <span class="${delay > 60 ? "delay-late" : "delay-ontime"}">
          ${delay} sec
        </span>
      `;

            if (vehicleMarkers[vehicleId]) {
                vehicleMarkers[vehicleId].setLatLng([lat, lon]).setPopupContent(popupHTML);
            } else {
                vehicleMarkers[vehicleId] = L.circleMarker([lat, lon], {
                    radius: 8,
                    weight: 2,
                    color: "#ffffff",
                    fillColor: "#0074d9",
                    fillOpacity: 1
                })
                    .addTo(map)
                    .bindPopup(popupHTML);
            }
        });

        // Drop markers for vehicles no longer in the feed
        Object.keys(vehicleMarkers).forEach((vehicleId) => {
            if (!vehicles[vehicleId]) {
                map.removeLayer(vehicleMarkers[vehicleId]);
                delete vehicleMarkers[vehicleId];
            }
        });
    } catch (err) {
        console.error("Failed to load realtime vehicles:", err);
    }
}

/**
 * -----------------------------------
 * NEARBY DEPARTURES (SIDEBAR)
 * -----------------------------------
 */
const NEARBY_LAT = 33.6846;
const NEARBY_LON = -117.827;

async function loadNearbyDepartures() {
    const url = `https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=${NEARBY_LAT}&lon=${NEARBY_LON}&limit_per_station=30`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const departures = flattenDepartures(data);
        updateDeparturesSidebar(departures);
    } catch (err) {
        console.error("Failed to load nearby departures:", err);
    }
}

/**
 * Normalizes the two differently-shaped response sections
 * (long_distance stations vs. local route/headsign groups)
 * into one flat array of departure objects.
 */
function flattenDepartures(data) {
    const routesLookup = data.routes || {};
    const departures = [];

    (data.long_distance || []).forEach((station) => {
        (station.departures || []).forEach((dep) => {
            const meta = routesLookup[dep.chateau_id]?.[dep.route_id] || {};
            departures.push({
                routeName: meta.short_name || dep.route_id,
                agencyName: meta.agency_name || dep.agency_id,
                color: meta.color,
                textColor: meta.text_color,
                headsign: dep.headsign,
                stopName: station.station_name,
                scheduled: dep.scheduled_departure,
                realtime: dep.realtime_departure,
                cancelled: dep.cancelled,
                delayed: dep.delayed
            });
        });
    });

    (data.local || []).forEach((route) => {
        Object.entries(route.headsigns || {}).forEach(([headsign, deps]) => {
            deps.forEach((dep) => {
                departures.push({
                    routeName: route.short_name,
                    agencyName: route.agency_name,
                    color: route.color,
                    textColor: route.text_color,
                    headsign,
                    stopName: dep.stop_name,
                    scheduled: dep.departure_schedule,
                    realtime: dep.departure_realtime,
                    cancelled: dep.cancelled,
                    delayed: dep.departure_realtime != null && dep.departure_realtime !== dep.departure_schedule
                });
            });
        });
    });

    // Soonest effective departure first; drop anything already gone
    const now = Date.now() / 1000;
    return departures
        .map((d) => ({ ...d, effective: d.realtime ?? d.scheduled }))
        .filter((d) => d.effective && d.effective >= now - 60)
        .sort((a, b) => a.effective - b.effective);
}

function formatEta(effectiveEpochSeconds) {
    const diffMin = Math.round((effectiveEpochSeconds * 1000 - Date.now()) / 60000);
    if (diffMin <= 0) return "Due";
    if (diffMin < 60) return `${diffMin} min`;
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hrs}h ${mins}m`;
}

function updateDeparturesSidebar(departures) {
    const tbody = document.getElementById("departure-table-body");
    const countEl = document.getElementById("departure-count");
    if (!tbody) return;

    countEl.textContent = departures.length;

    tbody.innerHTML = departures
        .slice(0, 40)
        .map((dep) => {
            const chip = `<span class="route-chip" style="background:${dep.color || "#666"};color:${dep.textColor || "#fff"}">${dep.routeName || "?"}</span>`;
            let etaClass = "";
            let etaText = formatEta(dep.effective);
            if (dep.cancelled) {
                etaClass = "eta-cancelled";
                etaText = "Cancelled";
            } else if (dep.delayed) {
                etaClass = "eta-delayed";
            } else if (etaText === "Due") {
                etaClass = "eta-due";
            }
            return `
        <tr class="vehicle-row">
          <td>${chip}</td>
          <td>${dep.headsign || "Unknown"}</td>
          <td>${dep.stopName || "Unknown"}</td>
          <td class="${etaClass}">${etaText}</td>
        </tr>
      `;
        })
        .join("");
}

/**
 * -----------------------------------
 * START MAP
 * -----------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
    initMap();
});