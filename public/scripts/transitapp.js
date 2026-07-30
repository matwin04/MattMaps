let map;
let userMarker;
let stopsLayer = L.layerGroup();
let bikesLayer = L.layerGroup();

let vehicleTypesCache = null; // cache so we don't refetch on every click

async function loadBikeTypeInfo(vehicleTypeId) {
  const url = 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/vehicle_types';
  const options = { method: 'GET' };

  try {
    if (!vehicleTypesCache) {
      const response = await fetch(url, options);
      const data = await response.json();
      vehicleTypesCache = data.data.vehicle_types;
    }

    const vType = vehicleTypesCache.find(v => v.vehicle_type_id === vehicleTypeId);

    if (!vType) {
      console.warn(`No vehicle type found for id ${vehicleTypeId}`);
      return;
    }

    const maxRangeKm = vType.max_range_meters
      ? (vType.max_range_meters / 1000).toFixed(1) + ' km'
      : 'N/A';

    const typeInfoHtml = `
      <p><strong>Form factor:</strong> ${vType.form_factor}</p>
      <p><strong>Propulsion:</strong> ${vType.propulsion_type}</p>
      <p><strong>Max range:</strong> ${maxRangeKm}</p>
    `;

    const container = document.getElementById('stopTimesTable_body');
    const bikeInfoDiv = container.querySelector('.bike-info');
    if (bikeInfoDiv) {
      bikeInfoDiv.insertAdjacentHTML('beforeend', typeInfoHtml);
    }

  } catch (error) {
    console.log(error);
  }
}

async function loadBikes() {
  const url = 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/free_bike_status';
  const options = { method: 'GET' };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    bikesLayer.clearLayers();

    const bikes = data.data.bikes;
    console.log(`Loaded ${bikes.length} bikes`);

    bikes.forEach((bike) => {
      if (bike.is_disabled) return;

      const lat = bike.lat;
      const lon = bike.lon;
      const color = bike.is_reserved ? '#999999' : '#2ecc71';

      const marker = L.circleMarker([lat, lon], {
        radius: 6,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
      });

      marker.on('click', () => showBikeInfo(bike));
      marker.addTo(bikesLayer);
    });

  } catch (error) {
    console.error(error);
  }
}

function showBikeInfo(bike) {
  document.getElementById('selected-stop').textContent = `Bike ${bike.bike_id.slice(0, 8)}`;

  const rangeKm = (bike.current_range_meters / 1000).toFixed(1);
  const status = bike.is_reserved ? 'Reserved' : 'Available';

  document.getElementById('stopTimesTable_body').innerHTML = `
    <div class="bike-info">
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Range:</strong> ${rangeKm} km</p>
      <p><strong>Vehicle type:</strong> ${bike.vehicle_type_id}</p>
      <p><strong>Pricing plan:</strong> ${bike.pricing_plan_id}</p>
      <p><strong>Location:</strong> ${bike.lat.toFixed(5)}, ${bike.lon.toFixed(5)}</p>
      <p><a href="${bike.rental_uris.ios}" target="_blank">Open rental link</a></p>
    </div>
  `;

  loadBikeTypeInfo(bike.vehicle_type_id);
}

function initMap(lat, lon) {
  map = L.map("map").setView([lat, lon], 15);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 20
  }).addTo(map);

  stopsLayer.addTo(map);
  bikesLayer.addTo(map);

  userMarker = L.circleMarker([lat, lon], {
    radius: 8,
    color: "#4da3ff",
    fillColor: "#4da3ff",
    fillOpacity: 1,
    weight: 2
  }).addTo(map);

  loadBikes();

  //loadStops();
  //map.on("moveend", loadStops);
}

initMap(34.0489, -118.2585);
