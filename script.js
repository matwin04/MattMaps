// script.js
// Requires maplibre-gl.js + maplibre-gl.css in the HTML instead of Leaflet:
// <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css" />
// <script src="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js"></script>

let map;
const vehicleMarkers = {};
const stationMarkers = {};
let userLocationMarker = null;

/**
 * -----------------------------------
 * MARKER ELEMENT HELPER
 * -----------------------------------
 * MapLibre markers are plain DOM elements (not canvas-drawn like Leaflet's
 * circleMarker), so build a small styled div to stand in for one.
 */
function createDotElement(diameter, fillColor) {
    const el = document.createElement("div");
    Object.assign(el.style, {
        width: `${diameter}px`,
        height: `${diameter}px`,
        borderRadius: "50%",
        background: fillColor,
        border: "2px solid #ffffff",
        boxShadow: "0 0 3px rgba(0,0,0,0.5)",
        cursor: "pointer"
    });
    return el;
}

/**
 * -----------------------------------
 * MAP
 * -----------------------------------
 */
function initMap() {
    map = new maplibregl.Map({
        container: "map",
        style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        center: [-118.25, 33.98],
        zoom: 10
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
        loadVehicles();
        //loadGeoJSON();
        centerOnUserLocation(); // also triggers the first loadNearbyDepartures() call
        setInterval(loadVehicles, 15000);
        setInterval(loadNearbyDepartures, 30000);
    });
}

/**
 * -----------------------------------
 * CENTER ON USER LOCATION
 * -----------------------------------
 */
function getNearbyDeparturesLongDistance(lat,lon) {
    const url = 'https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=34.0489&lon=-118.2585&limit_per_station=30';
const options = {method: 'GET'};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}
}
document.addEventListener("DOMContentLoaded", () => {
    initMap();
});
