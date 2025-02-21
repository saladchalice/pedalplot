   // Set your Mapbox access token here
   mapboxgl.accessToken = 'pk.eyJ1IjoiZXpsdSIsImEiOiJjbTdlMHMyNTIwOHJ5MmtvbzU2ZjNjYmxyIn0.SG1F8mPH1nuEVTOUbtE-ag';


   let timeFilter = -1;
   let filteredTrips = [];
   let filteredArrivals = new Map();
   let filteredDepartures = new Map();
   let filteredStations = [];


   // Initialize the map
   const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/ezlu/cm7e1d0po009y01soczek8xby', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
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

  });

   
  map.on('load', () => {
    const svg = d3.select('#map').select('svg');
    let stations = [];

    // Load the nested JSON file
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    
    d3.json(jsonurl).then(jsonData => {
        // console.log('Loaded JSON Data:', jsonData);
        stations = jsonData.data.stations;
        // console.log('Stations Array:', stations);

        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }


        // Load traffic data
        d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv')
            .then(trips => {     
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
                    .attr('opacity', 0.8)
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
                }


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
                    filterTripsByTime();
                }

                timeSlider.addEventListener('input', updateTimeDisplay);
            
                function filterTripsByTime() {
                    filteredTrips = timeFilter === -1
                        ? trips
                        : trips.filter(trip => {
                            const startedMinutes = minutesSinceMidnight(trip.started_at);
                            const endedMinutes = minutesSinceMidnight(trip.ended_at);
                            return (
                                Math.abs(startedMinutes - timeFilter) <= 60 ||
                                Math.abs(endedMinutes - timeFilter) <= 60
                            );
                        });
            
                    filteredDepartures = d3.rollup(
                        filteredTrips,
                        v => v.length,
                        d => d.start_station_id
                    );
            
                    filteredArrivals = d3.rollup(
                        filteredTrips,
                        v => v.length,
                        d => d.end_station_id
                    );
            
                    filteredStations = stations.map(station => {
                        let id = station.short_name;
                        return {
                            ...station,
                            arrivals: filteredArrivals.get(id) ?? 0,
                            departures: filteredDepartures.get(id) ?? 0,
                            totalTraffic: (arrivals.get(id) ?? 0) + (departures.get(id) ?? 0),
                        };
                    });           
                    // console.log('Filtered Stations:', filteredStations);
                }
            })
            .catch(error => {
                console.error('Error loading CSV:', error);
            });

    }).catch(error => {
        console.error('Error loading JSON:', error);
    });
});
    