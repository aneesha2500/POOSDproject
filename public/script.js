let numStops = 0;
var directionsRenderer;
var map;
let autocompleteSrc;
let autocompleteDest;
let autocompleteStops = [];

//initializes src and dest autocomplete
window.onload = function() {
    autocompleteSrc = new google.maps.places.Autocomplete(document.getElementById('startingLocation'));
    autocompleteSrc.addListener('place_changed', function() {
        var place = autocompleteSrc.getPlace();
        document.getElementById('startingLocation').value = place.formatted_address;
    });

    autocompleteDest = new google.maps.places.Autocomplete(document.getElementById('destination'));
    autocompleteDest.addListener('place_changed', function() {
        var place = autocompleteDest.getPlace();
        document.getElementById('destination').value = place.formatted_address;
    });
}

//adds a stop
function add() {
    if (numStops >= 19) {
        alert('Maximum number of stops reached.');
        return;
    }

    numStops++;
    const stopInputGroup = document.createElement("div");
    stopInputGroup.classList.add("stop-input-group");

    const element = document.createElement("input");
    element.setAttribute("type", "text");
    element.setAttribute("placeholder", "Stop " + numStops);
    element.setAttribute("id", "stop" + numStops);
    element.classList.add("location-input", "stop-input");
    stopInputGroup.appendChild(element);

    const timeInput = document.createElement("input");
    timeInput.setAttribute("type", "number");
    timeInput.setAttribute("placeholder", "Time at Stop " + numStops + " (mins)");
    timeInput.setAttribute("id", "timeAtStop" + numStops);
    timeInput.classList.add("time-input");
    stopInputGroup.appendChild(timeInput);

    const container = document.getElementById("stopsContainer");
    container.appendChild(stopInputGroup);

    container.scrollTop = container.scrollHeight;

    autocompleteStops[numStops - 1] = new google.maps.places.Autocomplete(document.getElementById('stop' + numStops));
    autocompleteStops[numStops - 1].addListener('place_changed', function() {
        var place = autocompleteStops[numStops - 1].getPlace();
        document.getElementById('stop' + numStops).value = place.formatted_address;
    });
}

//removes a stop
function remove() {
    if (numStops > 0) {
        const container = document.getElementById("stopsContainer");
        const lastStopGroup = container.lastChild;
        container.removeChild(lastStopGroup);
        numStops--;
    }
}

//submits the trip
document.getElementById('submitTrip').addEventListener('click', async function() {
    const src = document.getElementById('startingLocation').value;
    const dest = document.getElementById('destination').value;
    let avoidHighways = document.getElementById('avoidHighways').checked;
    let avoidTolls = document.getElementById('avoidTolls').checked;
    let travelMode = document.getElementById('travelMode').value;
    if (travelMode == 0) {
        alert('Please select a travel mode.');
        return;
    }
    else if (travelMode == 1) {
        travelMode = 'driving';
    }
    else if (travelMode == 2) {
        travelMode = 'bicycling';
    }
    else if (travelMode == 3) {
        travelMode = 'walking';
    }
    if (document.getElementById('startTime').value.length != 5) {
        alert('Please enter a complete start time.');
        return;
    }
    let formattedTime = document.getElementById('startTime').value;
    let timeArray = document.getElementById('startTime').value.split(':');
    let startTime = parseInt(timeArray[0]) * 3600 + parseInt(timeArray[1]) * 60;
    let stops = [];
    let times = [];

    for (let i = 1; i <= numStops; i++) {
        console.log("processing stop " + i);
        stops[i - 1] = document.getElementById('stop' + i).value;
        times[i - 1] = document.getElementById('timeAtStop' + i).value * 60;
    }
    console.log(stops);

    //constructs the JSON object
    const tripData = {
        src: src,
        dest: dest,
        stops: stops,
        times: times,
        travelMode: travelMode,
        startTime: startTime,
        avoidHighways: avoidHighways,
        avoidTolls: avoidTolls
    };

    //sends a POST request to /trip
    try {
        const response = await fetch('http://127.0.0.1:80/trip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tripData),
        });
        const data = await response.json();
        console.log("Result:", data);
        if (data.status != "OK") {
            alert(data.status);
            return;
        }
    
        //hides input elements
        let tripInfo = document.getElementsByClassName("trip-info");
        tripInfo[0].style.display = "none";             
        document.getElementById("editTrip").style.display = "block";
        document.getElementById("map").style.display = "block";

        //adds event listener to edit trip button
        document.getElementById('editTrip').addEventListener('click', async function() {
            //removes output elements
            let tripOutput = document.getElementById("trip-output");
            tripOutput.innerHTML = "<div id='start-time'></div><ul class='salesmanUL' id='outputList'></ul><div id='trip-time'></div><div id='map'></div><button id='editTrip'>Edit Trip</button>";
            document.getElementById("editTrip").style.display = "none";

            //shows input elements
            let tripInfo = document.getElementsByClassName("trip-info");
            tripInfo[0].style.display = "block";
        });

        let tripOutput = document.getElementById("trip-output");
        tripOutput.style.display = "block";

        //includes trip start time at the top of output
        tripStartTime = document.getElementById("start-time")
        var startTimeP = document.createElement('p');
        let period = 'AM';

        if (timeArray[0] >= 12) {
                period = 'PM';
        }
        if (timeArray[0] != 12) {
            timeArray[0] = timeArray[0] % 12;
            if (timeArray[0] == 0) {
                timeArray[0]=12;
            }
        }
        startTimeP.innerText = "Trip start time: " + timeArray[0] + ":" + timeArray[1]    + " " + period;
        tripStartTime.appendChild(startTimeP);

        //fills in output list with information
        let outputList = document.getElementById("outputList");

        //starting location
        let li = document.createElement('li');
        var address = document.createElement("span");
        address.innerText = "Starting Location: " + data.mapInfo.request.origin + " ";
        li.appendChild(address);
        var distance = document.createElement("span");
        distance.classList.add("salesmanUL");
        distance.innerText = "Distance to Next Stop: " + data.distances[0].toFixed(1) + " miles\n";
        li.appendChild(distance);
        var travelTime = document.createElement("span");
        travelTime.classList.add("salesmanUL");
        travelTime.innerText = "Time until Next Stop: " + data.travelTimes[0] + "\n";
        li.appendChild(travelTime);
        outputList.appendChild(li);

        //adds in each stop
        for (i = 0; i < data.stopOrder.length; ++i) {
                let li = document.createElement('li');
                var address = document.createElement("span");
                address.innerText = "\nStop " + (i+1) + ": " + data.mapInfo.request.waypoints[data.stopOrder[i]];
                li.appendChild(address);
                var eta = document.createElement("span");
                eta.classList.add("salesmanUL");
                eta.innerText = " ETA: " + data.arrivalTimes[i] + " - stay for " + times[data.stopOrder[i]]/60 + " minutes";
                li.appendChild(eta);
                var distance = document.createElement("span");
                distance.classList.add("salesmanUL");
                distance.innerText = "Distance to Next Stop: " + data.distances[i+1].toFixed(1) + " miles\n";
                li.appendChild(distance);
                var travelTime = document.createElement("span");
                travelTime.classList.add("salesmanUL");
                travelTime.innerText = "Time until Next Stop: " + data.travelTimes[i+1] + "\n";
                li.appendChild(travelTime);
                outputList.appendChild(li);
        }

        //final destination
        li = document.createElement('li');
        var address = document.createElement("span");
        address.classList.add("salesmanUL");
        address.innerText = "\nDestination: " + data.mapInfo.request.destination + " ";
        li.appendChild(address);
        var eta = document.createElement("span");
        eta.classList.add("salesmanUL");
        eta.innerText = "ETA: " + data.arrivalTimes[numStops] + "\n";
        li.appendChild(eta);
        outputList.appendChild(li);

        //total trip time
        tripTime = document.getElementById("trip-time")
        var totalTime = document.createElement('p');
        totalTime.innerText = "Total trip time: " + data.totalHours + " hours and " + data.totalMinutes + " minutes";
        tripTime.appendChild(totalTime);

        //converts data for the map
        data.mapInfo.routes = data.mapInfo.routes.map((response) => {
            const bounds = new google.maps.LatLngBounds(
                response.bounds.southwest,
                response.bounds.northeast,
            );
            response.bounds = bounds;
            response.overview_path =
                google.maps.geometry.encoding.decodePath(response.overview_polyline.points);
            response.legs = response.legs.map((leg) => {
                leg.start_location =
                    new google.maps.LatLng(leg.start_location.lat, leg.start_location.lng);
                leg.end_location =
                    new google.maps.LatLng(leg.end_location.lat, leg.end_location.lng);
                leg.steps = leg.steps.map((step) => {
                    step.path = google.maps.geometry.encoding.decodePath(step.polyline.points);
                    step.start_location = new google.maps.LatLng(
                        step.start_location.lat,
                        step.start_location.lng,
                    );
                    step.end_location = new google.maps.LatLng(
                        step.end_location.lat,
                        step.end_location.lng,
                    );
                    return step;
                });
                return leg;
            });
            return response;
        });

        console.log(data.mapInfo)

        //displays the map
        directionsRenderer = new google.maps.DirectionsRenderer();
        var mapOptions = {
            zoom: 1,
            center: new google.maps.LatLng(0, 0)
        };
        map = new google.maps.Map(document.getElementById('map'), mapOptions);
        directionsRenderer.setMap(map);
        directionsRenderer.setDirections(data.mapInfo);     

    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while submitting your trip details.');
    }
});