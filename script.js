// map.js

let map;
let geojsonLayer; //Loads geojson exported from OverpassTurbo
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

    setInterval(loadVehicles, 15000);
}

/**
 * -----------------------------------
 * LOAD REALTIME VEHICLES
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
    } catch (err) {
        console.error("Failed to load realtime vehicles:", err);
    }
}

/**
 * -----------------------------------
 * START MAP
 * -----------------------------------
 */

document.addEventListener("DOMContentLoaded", () => {
    initMap();
});
