// script.js
let map;
let geojsonLayer; // Loads geojson exported from OverpassTurbo
const vehicleMarkers = {};
const stationMarkers = {};

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
    centerOnUserLocation(); // also triggers the first loadNearbyDepartures() call
    setInterval(loadVehicles, 15000);
    setInterval(loadNearbyDepartures, 30000);
}

/**
 * -----------------------------------
 * CENTER ON USER LOCATION
 * -----------------------------------
 */
function centerOnUserLocation() {
    if (!navigator.geolocation) {
        console.warn("Geolocation not supported by this browser.");
        loadNearbyDepartures();
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 13);
            L.circleMarker([latitude, longitude], {
                radius: 7,
                weight: 2,
                color: "#ffffff",
                fillColor: "#ff4136",
                fillOpacity: 1
            })
                .addTo(map)
                .bindPopup("You are here");

            // Re-center the "nearby" query on the user's actual location
            NEARBY_LAT = latitude;
            NEARBY_LON = longitude;
            loadNearbyDepartures();
        },
        (err) => {
            console.warn("Geolocation failed or denied:", err.message);
            // Fall back to the default NEARBY_LAT/NEARBY_LON and default map view
            loadNearbyDepartures();
        },
        {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000
        }
    );
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
 * LOAD REALTIME VEHICLES (per route)
 * -----------------------------------
 */
const routeVehicleKeys = {}; // routeKey -> Set of marker keys currently shown for that route

async function loadVehiclesForRoute(chateauId, routeId) {
    const routeKey = `${chateauId}~${routeId}`;
    try {
        const url = `https://birch_rt.catenarymaps.org/get_rt_of_single_route?chateau=${encodeURIComponent(
            chateauId
        )}&route_id=${encodeURIComponent(routeId)}&last_updated_time_ms=${Date.now()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const vehicles = data.vehicle_positions || {};
        const newKeys = new Set();

        Object.entries(vehicles).forEach(([vehicleId, vehicle]) => {
            if (!vehicle.position) return;
            const markerKey = `${routeKey}~${vehicleId}`;
            newKeys.add(markerKey);

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

            if (vehicleMarkers[markerKey]) {
                vehicleMarkers[markerKey].setLatLng([lat, lon]).setPopupContent(popupHTML);
            } else {
                vehicleMarkers[markerKey] = L.circleMarker([lat, lon], {
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

        // Drop markers for this route's vehicles that dropped out of the feed
        const previousKeys = routeVehicleKeys[routeKey] || new Set();
        previousKeys.forEach((markerKey) => {
            if (!newKeys.has(markerKey) && vehicleMarkers[markerKey]) {
                map.removeLayer(vehicleMarkers[markerKey]);
                delete vehicleMarkers[markerKey];
            }
        });
        routeVehicleKeys[routeKey] = newKeys;
    } catch (err) {
        console.error(`Failed to load vehicles for route ${routeKey}:`, err);
    }
}

function loadVehicles() {
    // Default LA Metro Rail route, kept from the original setup
    return loadVehiclesForRoute("metro~losangeles", "801");
}

/**
 * Extracts the unique (chateau, route_id) pairs for every "local" line
 * present in the nearby-departures response.
 */
function extractLocalRoutePairs(data) {
    const pairs = new Map();
    (data.local || []).forEach((route) => {
        const key = `${route.chateau_id}~${route.route_id}`;
        pairs.set(key, { chateauId: route.chateau_id, routeId: route.route_id });
    });
    return Array.from(pairs.values());
}

let activeLocalRouteKeys = new Set();

function loadVehiclesForNearbyLocalRoutes(data) {
    const localRoutes = extractLocalRoutePairs(data);
    const newActiveKeys = new Set(localRoutes.map((r) => `${r.chateauId}~${r.routeId}`));

    // A route that's no longer nearby: clear its vehicles off the map
    activeLocalRouteKeys.forEach((routeKey) => {
        if (!newActiveKeys.has(routeKey)) {
            (routeVehicleKeys[routeKey] || new Set()).forEach((markerKey) => {
                if (vehicleMarkers[markerKey]) {
                    map.removeLayer(vehicleMarkers[markerKey]);
                    delete vehicleMarkers[markerKey];
                }
            });
            delete routeVehicleKeys[routeKey];
        }
    });
    activeLocalRouteKeys = newActiveKeys;

    localRoutes.forEach(({ chateauId, routeId }) => loadVehiclesForRoute(chateauId, routeId));
}

/**
 * -----------------------------------
 * NEARBY DEPARTURES (SIDEBAR)
 * -----------------------------------
 */
let NEARBY_LAT = 33.6846;
let NEARBY_LON = -117.827;

async function loadNearbyDepartures() {
    const url = `https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=${NEARBY_LAT}&lon=${NEARBY_LON}&limit_per_station=30`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const stopGroups = groupDeparturesByStop(data);
        updateDeparturesSidebar(stopGroups);
        renderStationMarkers(stopGroups);
        loadVehiclesForNearbyLocalRoutes(data);
    } catch (err) {
        console.error("Failed to load nearby departures:", err);
    }
}


function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Groups both response sections (long_distance stations, which are
 * already per-station, and local routes, which are grouped by
 * route/headsign instead) into one stop -> departures structure,
 * sorted by distance from the user, then by soonest departure.
 */
function groupDeparturesByStop(data) {
    const routesLookup = data.routes || {};
    const stopsLookup = data.stops || {};
    const groups = new Map();

    function getGroup(key, stopName, distance, lat, lon) {
        if (!groups.has(key)) {
            groups.set(key, { key, stopName, distance, lat, lon, departures: [] });
        }
        return groups.get(key);
    }

    // long_distance entries are already one-per-station
    (data.long_distance || []).forEach((station) => {
        const key = `ld-${station.osm_station_id}-${station.station_name}`;
        const group = getGroup(key, station.station_name, station.distance_m, station.lat, station.lon);
        (station.departures || []).forEach((dep) => {
            const meta = routesLookup[dep.chateau_id]?.[dep.route_id] || {};
            group.departures.push({
                routeName: meta.short_name || dep.route_id,
                color: meta.color,
                textColor: meta.text_color,
                headsign: dep.headsign,
                scheduled: dep.scheduled_departure,
                realtime: dep.realtime_departure,
                cancelled: dep.cancelled,
                delayed: dep.delayed
            });
        });
    });

    // local entries are grouped by route/headsign, so regroup by stop
    (data.local || []).forEach((route) => {
        Object.entries(route.headsigns || {}).forEach(([headsign, deps]) => {
            deps.forEach((dep) => {
                const key = `${route.chateau_id}-${dep.stop_id}`;
                let distance = null;
                const stopMeta = stopsLookup[route.chateau_id]?.[dep.stop_id];
                if (stopMeta) {
                    distance = haversineMeters(NEARBY_LAT, NEARBY_LON, stopMeta.lat, stopMeta.lon);
                } else if (typeof route.closest_distance === "number") {
                    distance = route.closest_distance;
                }
                const group = getGroup(key, dep.stop_name, distance, stopMeta?.lat ?? null, stopMeta?.lon ?? null);
                group.departures.push({
                    routeName: route.short_name,
                    color: route.color,
                    textColor: route.text_color,
                    headsign,
                    scheduled: dep.departure_schedule,
                    realtime: dep.departure_realtime,
                    cancelled: dep.cancelled,
                    delayed: dep.departure_realtime != null && dep.departure_realtime !== dep.departure_schedule
                });
            });
        });
    });

    const now = Date.now() / 1000;
    const stopGroups = Array.from(groups.values()).map((group) => {
        const departures = group.departures
            .map((d) => ({ ...d, effective: d.realtime ?? d.scheduled }))
            .filter((d) => d.effective && d.effective >= now - 60)
            .sort((a, b) => a.effective - b.effective);
        return { ...group, departures };
    });

    return stopGroups
        .filter((g) => g.departures.length > 0)
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

function formatDistance(meters) {
    if (meters == null) return "";
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(meters / 1609.34).toFixed(1)} mi`;
}

/**
 * -----------------------------------
 * STATION MARKERS
 * -----------------------------------
 */
function renderStationMarkers(stopGroups) {
    // Clear stale markers from the previous fetch
    Object.keys(stationMarkers).forEach((key) => {
        map.removeLayer(stationMarkers[key]);
        delete stationMarkers[key];
    });

    stopGroups.forEach((group) => {
        if (group.lat == null || group.lon == null) return;

        const popupRows = group.departures
            .slice(0, 5)
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
          <tr>
            <td>${chip}</td>
            <td>${dep.headsign || "Unknown"}</td>
            <td class="${etaClass}">${etaText}</td>
          </tr>
        `;
            })
            .join("");

        const popupHTML = `
      <div class="popup-title">${group.stopName || "Stop"}</div>
      <table class="vehicle-table popup-table">
        <thead>
          <tr><th>Route</th><th>Headsign</th><th>ETA</th></tr>
        </thead>
        <tbody>
          ${popupRows || `<tr><td colspan="3">No upcoming departures</td></tr>`}
        </tbody>
      </table>
    `;

        stationMarkers[group.key] = L.circleMarker([group.lat, group.lon], {
            radius: 7,
            weight: 2,
            color: "#ffffff",
            fillColor: "#ff9500",
            fillOpacity: 1
        })
            .addTo(map)
            .bindPopup(popupHTML, { maxWidth: 260 });
    });
}

function formatEta(effectiveEpochSeconds) {
    const diffMin = Math.round((effectiveEpochSeconds * 1000 - Date.now()) / 60000);
    if (diffMin <= 0) return "Due";
    if (diffMin < 60) return `${diffMin} min`;
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hrs}h ${mins}m`;
}

function updateDeparturesSidebar(stopGroups) {
    const tbody = document.getElementById("departure-table-body");
    const countEl = document.getElementById("departure-count");
    if (!tbody) return;

    const visibleGroups = stopGroups.slice(0, 8);
    const totalDepartures = visibleGroups.reduce((sum, g) => sum + Math.min(g.departures.length, 6), 0);
    countEl.textContent = totalDepartures;

    tbody.innerHTML = visibleGroups
        .map((group) => {
            const headerRow = `
        <tr class="stop-group-header" data-stop-key="${group.key}">
          <td colspan="3">${group.stopName || "Unknown stop"} <span class="stop-distance">${formatDistance(group.distance)}</span></td>
        </tr>
      `;

            const departureRows = group.departures
                .slice(0, 6)
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
            <td class="${etaClass}">${etaText}</td>
          </tr>
        `;
                })
                .join("");

            return headerRow + departureRows;
        })
        .join("");

    // Clicking a stop header pans the map to that station's marker
    tbody.querySelectorAll(".stop-group-header").forEach((row) => {
        row.addEventListener("click", () => {
            const key = row.dataset.stopKey;
            const marker = stationMarkers[key];
            if (marker) {
                map.setView(marker.getLatLng(), 15);
                marker.openPopup();
            }
        });
    });
}

/**
 * -----------------------------------
 * START MAP
 * -----------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
    initMap();
});