let map;
let userMarker;
let stopsLayer = L.layerGroup();


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
  setupVectorTileLayers();
    //loadStops();
}
function setupVectorTileLayers() {
  if (typeof L.vectorGrid === "undefined") {
    console.warn("Leaflet.VectorGrid not loaded — route/stop vector tiles skipped.");
    return;
  }

  const routeTypeColors = {
    2: null, // rail — use feature's own route_color
    1: null, // subway
    0: null  // light rail
  };
  L.vectorGrid.protobuf(
    "https://transit.land/api/v2/tiles/routes/tiles/{z}/{x}/{y}.pbf?apikey=WOo9vL8ECMWN76EcKjsNGfo8YgNZ7c2u",
    {
      vectorTileLayerStyles: {
        routes: (properties) => ({
          color: hexColor(properties.route_color),
          weight: 3,
          opacity: 0.9
        })
      },
      interactive: true,
      maxNativeZoom: 14
    }
  ).addTo(map);
  // Note: the Transitland "stops" vector tile layer is intentionally not
  // loaded here — station dots are already rendered from the GeoJSON
  // sources in setupStationLayers(), so fetching a second, invisible copy
  // of every stop tile was pure wasted bandwidth/render time.
}
initMap(34.0489, -118.2585);
