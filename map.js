async function getNearbyDeparturesLongDistance(lat, lon) {
    const url = `https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=${lat}&lon=${lon}&limit_per_station=30`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        return data.long_distance;
    } catch (error) {
        console.error(error);
    }
}

async function getNearbyLocalDepartures(lat, lon) {
    const url = `https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=${lat}&lon=${lon}&limit_per_station=30`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        return data.local;
    } catch (error) {
        console.log(error);
    }
}

async function getNearbyRoutes(lat, lon) {
    const url = `https://birch_nearby.catenarymaps.org/nearbydeparturesfromcoordsv3?lat=${lat}&lon=${lon}&limit_per_station=30`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        return data.routes;
    } catch (error) {
        console.log(error);
    }
}

async function loadNearbLocalStations(lat, lon) {
    const tbody = document.getElementById("longDistanceDepartures_body");
    tbody.innerHTML = "Loading...";
    const stations = await getNearbyDeparturesLongDistance(lat, lon);
    tbody.innerHTML = "";
    if (!stations) return;
    stations.forEach((station) => {
        station.departures.forEach((dep) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${station.station_name}</td>
                <td>${dep.route_id}</td>
                <td>${dep.headsign}</td>
                <td>${dep.realtime_departure ?? dep.scheduled_departure}</td>`;
            tbody.appendChild(tr);
        });
    });
}

async function loadNearbLocalDepartures(lat, lon) {
    const tbody = document.getElementById("localDepartures_body");
    tbody.innerHTML = "";
    const departures = await getNearbyLocalDepartures(lat, lon);
    if (!departures) return;
    departures.forEach((dep) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${dep.chateau_id}</td>
            <td>${dep.route_id}</td>
            <td>${dep.short_name}</td>
            <td>${dep.realtime_departure ?? dep.scheduled_departure}</td>`;
        tbody.appendChild(tr);
    });
}

async function loadNearbyRoutes(lat, lon) {
    const tbody = document.getElementById("routesTable_body");
    tbody.innerHTML = "";
    const routes = await getNearbyRoutes(lat, lon);
    if (!routes) return;
    Object.keys(routes).forEach((chateau) => {
        const chateauRoutes = routes[chateau];
        Object.keys(chateauRoutes).forEach((routeId) => {
            const route = chateauRoutes[routeId];
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${routeId}</td>
                <td>${route.short_name ?? "--"}</td>
                <td>${route.long_name ?? "--"}</td>
                <td>${route.agency_name ?? chateau}</td>
                <td><span class="route-pill" style="background:${route.color}; color:${route.text_color}">${route.short_name ?? routeId}</span></td>`;
            tbody.appendChild(tr);
        });
    });
}

async function getRouteInfo(chateau, route_id) {
    const url = `https://birch.catenarymaps.org/route_info_v2?chateau=${chateau}&route_id=${route_id}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.log(error);
    }
}

async function loadRouteInfo(chateau, route_id) {
    const tbody = document.getElementById("routeInfo_body");
    tbody.innerHTML = "";
    const route = await getRouteInfo(chateau, route_id);
    if (!route) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${route.short_name ?? "--"}</td>
        <td>${route.long_name ?? "--"}</td>
        <td>${route.agency_name ?? "--"}</td>
        <td>${route.url ? `<a href="${route.url}" target="_blank">link</a>` : "--"}</td>
        <td><span class="route-pill" style="background:${route.color}; color:${route.text_color}">${route.short_name ?? route_id}</span></td>
        <td>${Object.keys(route.stops ?? {}).length}</td>`;
    tbody.appendChild(tr);
}

document.getElementById("route-info-btn").addEventListener("click", () => {
    const chateau = document.getElementById("chateau-input").value.trim();
    const routeId = document.getElementById("route-id-input").value.trim();
    loadRouteInfo(chateau, routeId);
});

let map;
let userMarker;

function initMap(lat, lon) {
    map = new maplibregl.Map({
        container: "map",
        style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        center: [lon, lat],
        zoom: 13
    });
    map.addControl(new maplibregl.NavigationControl());
    userMarker = new maplibregl.Marker({ color: "#4da3ff" }).setLngLat([lon, lat]).addTo(map);
}

function updateUserLocation(lat, lon) {
    document.getElementById("lat-input").value = lat;
    document.getElementById("lon-input").value = lon;
    document.getElementById("coord-label").textContent = `${lat}, ${lon}`;
    if (!map) {
        initMap(lat, lon);
    } else {
        map.setCenter([lon, lat]);
        userMarker.setLngLat([lon, lat]);
    }
    loadNearbLocalStations(lat, lon);
    loadNearbLocalDepartures(lat, lon);
    loadNearbyRoutes(lat, lon);
}

document.getElementById("locate-btn").addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateUserLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            console.error(error);
            alert("Could not get your location.");
        }
    );
});

document.getElementById("refresh-btn").addEventListener("click", () => {
    const lat = document.getElementById("lat-input").value.trim();
    const lon = document.getElementById("lon-input").value.trim();
    loadNearbLocalStations(lat, lon);
    loadNearbLocalDepartures(lat, lon);
    loadNearbyRoutes(lat, lon);
});

initMap(34.0489, -118.2585);
loadNearbLocalStations("34.0489", "-118.2585");
loadNearbLocalDepartures("34.0489", "-118.2585");
loadNearbyRoutes("34.0489", "-118.2585");
