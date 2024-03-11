let numStops = 2;//based on how many stops the user has added

//add start time field (both hours and minutes), time for each stop, and button that adds a new input area (updating numStops)
document.getElementById('submitTrip').addEventListener('click', async function() {
    const src = document.getElementById('startingLocation').value;
    const dest = document.getElementById('destination').value;
    let startTime = 0; //document.getElementById('startTimeHour').value * 3600 + document.getElementById('startTimeMinute').value * 60;
    let stops = [];
    let times = [1200, 1200];//these values are just a placeholder for now until the input fields are setup

    for (let i = 1; i <= numStops; i++) {
        console.log("processing stop " + i);
        stops[i - 1] = document.getElementById('stop' + i).value;
        //times[i - 1] = document.getElementById('timeAtStop' + i).value * 60;
    }
    console.log(stops);

    // Construct the JSON object
    const tripData = {
        src: src,
        dest: dest,
        stops: stops,
        times: times,
        startTime: startTime
    };

    // Send a POST request to /trip
    await fetch('http://127.0.0.1:80/trip', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(tripData),
    })
    .then(response => response.json())
    .then(data => {
        console.log("Result:", data);
        if (data.status != "OK") {
            alert(data.status);
            return;
        }

      //else, display all fields for the user
    })
    .catch((error) => {
        console.error('Error:', error);
        alert('An error occurred while submitting your trip details.');
    });
});