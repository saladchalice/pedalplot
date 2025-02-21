   // Set your Mapbox access token here
   mapboxgl.accessToken = 'pk.eyJ1IjoiZXpsdSIsImEiOiJjbTdlMHMyNTIwOHJ5MmtvbzU2ZjNjYmxyIn0.SG1F8mPH1nuEVTOUbtE-ag';

   // initialize global variables -----------------------------------------------
   let timeFilter = -1;

   // filtered
   let filteredTrips = [];
   let filteredArrivals = new Map();
   let filteredDepartures = new Map();
   let filteredStations = [];

   // filtering efficiency
   let departuresByMinute = Array.from({ length: 1440 }, () => []);
   let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

   // stations, trips, and svg
   let stations = [];
   let trips = [];
   const svg = d3.select('#map').select('svg');





   // Initialize the map ----------------------------------------------------------------
   const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/ezlu/cm7e1d0po009y01soczek8xby', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 11, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
  });

  map.on('load', () => { 
    // boston bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
      });
    
      map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#32D400',  // A bright green using hex code
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.5       // Slightly less transparent
          }
      });
    
    // cambridge bike lanes
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...'
    });
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#32D400',  // A bright green using hex code
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.5       // Slightly less transparent
          }
      });

    // station data ----------------------------------------------------------------------------------------------
    // Load the nested JSON file
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    
    d3.json(jsonurl).then(jsonData => {
        // console.log('Loaded JSON Data:', jsonData);
        stations = jsonData.data.stations;
        // console.log('Stations Array:', stations);



        // Load traffic data
        d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv')
            .then(data => {     
                trips = data;
                const departures = d3.rollup(
                    trips,
                    v => v.length,
                    d => d.start_station_id
                );

                const arrivals = d3.rollup(
                    trips,
                    v => v.length,
                    d => d.end_station_id
                );

                stations = stations.map(station => {
                    let id = station.short_name;
                    return {
                        ...station,
                        arrivals: arrivals.get(id) ?? 0,
                        departures: departures.get(id) ?? 0,
                        totalTraffic: (arrivals.get(id) ?? 0) + (departures.get(id) ?? 0),
                    };
                });
                // console.log(stations);

                const radiusScale = d3.scaleSqrt()
                .domain([0, d3.max(stations, d => d.totalTraffic)])  // Use filteredStations
                .range(timeFilter === -1 ? [0, 25] : [3, 50]);

                // Append circles to the SVG for each station
                const circles = svg.selectAll('circle')
                    .data(stations)
                    .enter()
                    .append('circle')
                    .attr('r', d => radiusScale(d.totalTraffic))
                    .attr('fill', 'steelblue')
                    .attr('stroke', 'white')
                    .attr('stroke-width', 1)
                    .attr('opacity', 0.7)
                    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
                    .each(function(d) {
                        d3.select(this)
                            .append('title')
                            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                    });

                function updatePositions() {
                    circles.attr('cx', d => getCoords(d).cx)
                            .attr('cy', d => getCoords(d).cy);
                }
                // Initial position update
                updatePositions();
            
                // Update on map interactions
                map.on('move', updatePositions);
                map.on('zoom', updatePositions);
                map.on('resize', updatePositions);
                map.on('moveend', updatePositions);
            
                // Filtering logic
                for (let trip of trips) {
                    trip.started_at = new Date(trip.started_at);
                    trip.ended_at = new Date(trip.ended_at);
                    // Get the minutes since midnight for the start and end times
                    let startedMinutes = minutesSinceMidnight(trip.started_at);
                    let endedMinutes = minutesSinceMidnight(trip.ended_at);

                    // Track the departures by minute
                    departuresByMinute[startedMinutes].push(trip);

                    // Track the arrivals by minute (new part)
                    arrivalsByMinute[endedMinutes].push(trip);
                }                
                
            })
            .catch(error => {
                console.error('Error loading CSV:', error);
            });

    }).catch(error => {
        console.error('Error loading JSON:', error);
    });
});
    


function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}
// -----------------------------------------------------------------------------------
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}   

//slider functionality ---------------------------------------------------------
// select elements
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);  // Get slider value

    if (timeFilter === -1) {
    selectedTime.textContent = '';  // Clear time display
    anyTimeLabel.style.display = 'block';  // Show "(any time)"
    } else {
    selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
    anyTimeLabel.style.display = 'none';  // Hide "(any time)"
    }

    // Trigger filtering logic which will be implemented in the next step
    // console.log('ok');
    updateCircles(filterTripsByTime());
}

timeSlider.addEventListener('input', updateTimeDisplay);


function filterTripsByTime() {
    // Apply time filtering to arrivals and departures based on timeFilter
    let filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
    let filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);

    // Preprocess filtered arrivals and departures into lookup maps
    let arrivalCount = {};
    let departureCount = {};

    // Populate arrivalCount map
    filteredArrivals.forEach(d => {
        arrivalCount[d.end_station_id] = (arrivalCount[d.end_station_id] || 0) + 1;
    });

    // Populate departureCount map
    filteredDepartures.forEach(d => {
        departureCount[d.start_station_id] = (departureCount[d.start_station_id] || 0) + 1;
    });

    // Now map stations with the precomputed arrival and departure counts
    filteredStations = stations.map(station => {
        let id = station.short_name;

        const stationArrivals = arrivalCount[id] || 0;
        const stationDepartures = departureCount[id] || 0;

        return {
            ...station,
            arrivals: stationArrivals,
            departures: stationDepartures,
            totalTraffic: stationArrivals + stationDepartures,
        };
    });

    return filteredStations;
}


function filterByMinute(tripsByMinute, minute) {
    // Normalize both to the [0, 1439] range
    // % is the remainder operator: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
  
    if (minMinute > maxMinute) {
      let beforeMidnight = tripsByMinute.slice(minMinute);
      let afterMidnight = tripsByMinute.slice(0, maxMinute);
      return beforeMidnight.concat(afterMidnight).flat();
    } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
  }

function updateCircles(filteredStations) {
    // Recalculate the radius scale based on filtered data
    const radiusScale2 = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])  // Use filteredStations
    .range(timeFilter === -1 ? [0, 25] : [0, 60]);

    // Update the circles
    const circles = svg.selectAll('circle')
        .data(filteredStations);

    // Enter new circles or update existing ones
    circles.enter()
        .append('circle')
        .attr('r', d => radiusScale2(d.totalTraffic)) // Set the initial radius based on data
        .merge(circles) // Merge new data with existing circles
        .transition().duration(100)  // Smooth transition for updates
        .attr('r', d => radiusScale2(d.totalTraffic)) // Update radius based on new data
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
        .each(function(d) {
            d3.select(this).select('title').text(
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
            );
        });
        

    // Remove circles if they no longer exist in the filtered data
    circles.exit().remove();
}

// flow
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
