let map;
let userMarker;
let stopsLayer = L.layerGroup();
let bikesLayers = {}; // one layer per provider, so you can toggle them independently

let vehicleTypesCache = {}; // keyed by provider
const gbfsSources = {
  veoride: {
    base: 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs',
    free_bike_status: 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/free_bike_status',
    vehicle_types: 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/vehicle_types',
    station_information: 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/station_information',
    station_status: 'https://cluster-prod.veoride.com/api/shares/name/xla/gbfs/station_status'
  },
  bird: {
    base: 'https://mds.bird.co/gbfs/v2/public/los-angeles/gbfs.json', // placeholder, swap for real endpoint
    free_bike_status: 'https://mds.bird.co/gbfs/v2/public/los-angeles/free_bike_status.json',
    vehicle_types: 'https://mds.bird.co/gbfs/v2/public/los-angeles/vehicle_types.json'
  },
  metrobikeshare: {
    base: 'https://gbfs.bcycle.com/bcycle_lametro', // placeholder
    free_bike_status: 'https://gbfs.bcycle.com/bcycle_lametro/free_bike_status.json',
    station_information: 'https://gbfs.bcycle.com/bcycle_lametro/station_information.json',
    station_status: 'https://gbfs.bcycle.com/bcycle_lametro/station_status.json'
  }
};
async function loadBikeTypeInfo(provider, vehicleTypeId) {
  const source = gbfsSources[provider];
  if (!source || !source.vehicle_types) return;

  const options = { method: 'GET' };

  try {
    if (!vehicleTypesCache[provider]) {
      const response = await fetch(source.vehicle_types, options);
      const data = await response.json();
      vehicleTypesCache[provider] = data.data.vehicle_types;
    }

    const vType = vehicleTypesCache[provider].find(v => v.vehicle_type_id === vehicleTypeId);

    if (!vType) {
      console.warn(`No vehicle type found for id ${vehicleTypeId} (${provider})`);
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

async function loadBikes(provider) {
  const source = gbfsSources[provider];
  if (!source || !source.free_bike_status) {
    console.warn(`No free_bike_status endpoint for ${provider}`);
    return;
  }

  if (!bikesLayers[provider]) {
    bikesLayers[provider] = L.layerGroup().addTo(map);
  }
  const layer = bikesLayers[provider];

  const options = { method: 'GET' };

  try {
    const response = await fetch(source.free_bike_status, options);
    const data = await response.json();
    layer.clearLayers();

    const bikes = data.data.bikes;
    console.log(`[${provider}] Loaded ${bikes.length} bikes`);

    bikes.forEach((bike) => {
      if (bike.is_disabled) return;

      const color = bike.is_reserved ? '#999999' : '#2ecc71';

      const marker = L.circleMarker([bike.lat, bike.lon], {
        radius: 6,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
      });

      marker.on('click', () => showBikeInfo(provider, bike));
      marker.addTo(layer);
    });

  } catch (error) {
    console.error(`[${provider}]`, error);
  }
}

function showBikeInfo(provider, bike) {
  document.getElementById('selected-stop').textContent = `Bike ${bike.bike_id.slice(0, 8)} (${provider})`;

  const rangeKm = (bike.current_range_meters / 1000).toFixed(1);
  const status = bike.is_reserved ? 'Reserved' : 'Available';

  document.getElementById('stopTimesTable_body').innerHTML = `
    <div class="bike-info">
      <p><strong>Provider:</strong> ${provider}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Range:</strong> ${rangeKm} km</p>
      <p><strong>Vehicle type:</strong> ${bike.vehicle_type_id}</p>
      <p><strong>Pricing plan:</strong> ${bike.pricing_plan_id}</p>
      <p><strong>Location:</strong> ${bike.lat.toFixed(5)}, ${bike.lon.toFixed(5)}</p>

    </div>
  `;

  loadBikeTypeInfo(provider, bike.vehicle_type_id);
}

function loadAllBikes() {
  Object.keys(gbfsSources).forEach(provider => loadBikes(provider));
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

  loadAllBikes();

  //loadStops();
  //map.on("moveend", loadStops);
}

initMap(34.0489, -118.2585);
