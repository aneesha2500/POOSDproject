const express = require('express');
const axios = require('axios');
const cors = require('cors');

const hostname = '127.0.0.1';
const apiKey = "AIzaSyAOHxhGH00oZb9tOht2cmZiYUU-ZB-RXRw";
const port = 80;
const app = express();

/*
MAKE SURE NODE, EXPRESS, AXIOS, AND CORS ARE INSTALLED IN YOUR DIRECTORY

RUN SERVER IN TERMINAL
node projectTest.js

TEST POST REQUEST IN SEPARATE TERMINAL WHILE SERVER IS RUNNING
curl -d '{"src":"2811 Einstein Way, Orlando, FL","dest":"4000 Central Florida Blvd, Orlando, FL","stops":["Miami, FL","Tampa, FL","Gainesville, FL"],"times":[3600,7200,10800],"startTime":8400}' -H "Content-Type: application/json" http://127.0.0.1:80/trip

FRONTEND SENDS TO BACKEND IN FOLLOWING FORMAT: 
    src: "2811 Einstein Way, Orlando, FL", //source address
    dest: "4000 Central Florida Blvd, Orlando, FL", //destination address
    stops: ["Miami, FL", "Tampa, FL", "Gainesville, FL"], //array of stop addresses
    times: ["3600", "7200", "10800"], //array of times at each stop in seconds (can be given as string or number)
    startTime: "8400" //start time in seconds into the day (can be given as string or number)

DATA SENT TO FRONTEND IN FOLLOWING FORMAT:
	stopOrder: bestRoute.routes[0].waypoint_order, //array of indicies of stops in order
	distances: distances, //array of distances between stops (index 0 for src to stop at index 0, index 1 for stop at index 0 to index 1, etc.)
	arrivalTimes: arrivalTimes //array of arrival times in clock format (index 0 for arrival at stop at index 0, index 1 for arrival at stop at index 1, etc.)
	status: "" //status of the request described below

STATUS MESSAGES TO FRONTEND:
	status: "OK" - no errors and all fields are valid and filled
	status: "invalid startTime" - startTime is not a number
	status: "invalid source address" - incorrect source address 
	status: "invalid destination address"
	status: "invalid route" - error with the route itself - most likely impossible to travel between certain addresses
	status: ("invalid address at stop index " + i) - index i has an invalid address
	status: "times and stops have unequal length" - not exactly one time per stop
	status: ("time at index " + i + " is invalid") - time for stop at index i is not a number
*/

app.use(express.json());
app.use(cors());

//puts data into imperial units
function metersToMiles(meters) {
	return meters * 0.000621371;
}

//converts seconds into clock format
function secondsToClock(seconds) {
	let AmPm = "AM";
	let hours = Math.floor(seconds / 3600);
	seconds = seconds % 3600;
	let minutes = Math.round(seconds / 60);

	//adjusts if it is PM
	if ((hours % 24) > 12) {
		hours -= 12;
		AmPm = "PM";
	}
	//adjusts if it is midnight
	else if ((hours % 24) == 0)
		hours = 12;

	//adds 0 if minutes is less than 10
	if (minutes < 10)
		return hours + ":0" + minutes + " " + AmPm;
	else
		return hours + ":" + minutes + " " + AmPm;
}

//responds to post request
app.post('/trip', async (req, res) => {  

	console.log("received" + req.body);

	//NEED TO ADD DATA PARSER FROM FRONTEND REQUEST AND VALIDATE DATA TYPES
	let src = req.body.src; //source address
	let dest = req.body.dest; //destination address
	let stops = req.body.stops; //array of stop addresses
	let times = req.body.times; //array of times at each stop in seconds
	let startTime = parseFloat(req.body.startTime); //start time seconds into the day

	console.log(src);
	console.log(dest);
	console.log(stops);
	console.log(times);
	console.log(startTime);

	//validates startTime
	if (isNaN(startTime)) {
		//ERROR
		console.log("error - startTime is not a number");
		res.send(JSON.stringify({status: "invalid startTime"}));
		return;
	}

	//adjusts startTime to be within 24 hours
	startTime = startTime % 86400;

	//if there is not exactly one time per stop, error
	if (stops.length != times.length) {
		//ERROR
		console.log("error - times not defined for all stops");
		res.send(JSON.stringify({status: "times and stops have unequal length"}));
		return;
	}

	//turns all times from strings into numbers, and confirms they are valid
	for (let i = 0; i < times.length; i++) {
		times[i] = parseFloat(times[i]);
		if (isNaN(times[i]) || times[i] < 0) {
			//ERROR
			console.log("error - time at index " + i + " is not a valid number");
			res.send(JSON.stringify({status: ("time at index " + i + " is invalid")}));
			return;
		}
	}

	//process data
	let data = await receiveRequest(src, dest, stops, times, startTime);

	//errors with addresses are handled
	if (data === "s") {
		//error with source
		console.log("error with source")
		res.send(JSON.stringify({status: "invalid source address"}));
		return;
	}
	else if (data === "d") {
		//error with dest
		console.log("error with dest")
		res.send(JSON.stringify({status: "invalid destination address"}));
		return;
	}
	else if (data === "r") {
		//error with route
		console.log("error with route");
		res.send(JSON.stringify({status: "invalid route"}));
		return;
	}
	else if (typeof(data) == 'number') {
		//error with stop at index data - 1
		console.log("error with stop at index " + (data - 1));
		res.send(JSON.stringify({status: ("invalid address at stop index " + (data - 1))}));
		return;
	}

	console.log(data);

	//send information to frontend
	res.send(data);
	return;
});

//API call to google maps that gets the best route
const getBestRoute = async (src, dest, stops) => {
	const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
		params: {
			origin: src, // origin
			destination: dest, // ending point
			waypoints: `optimize:true|${stops.join('|')}`,
			travelMode: "DRIVING",
			key: apiKey
		}
	});

	return response.data;
}

//API call to google maps that validates the address
const validateAddress = async (address) => {
	const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
	  params: {
		address: address,
		key: apiKey
	  }
	});
	
	return response.data;
  }

//processes the data
async function receiveRequest(src, dest, stops, times, startTime) {
	//handle address errors
	let errorCode = await validateAddresses(src, dest, stops);
	if (errorCode != 0) {
		return errorCode;
	}

	console.log("no errors");

	//get best route
	let bestRoute = await getBestRoute(src, dest, stops);

	//initializing arrays for travel times in seconds and in string formart, and distances
	let arrivalSec = [];
	let arrivalTimes = [];
	let distances = [];

	if (bestRoute.status != "OK") {
		//ERROR
		return "r";
	}

	//populate arrays with each leg of the route
	for (let i = 0; i < bestRoute.routes[0].legs.length; i++) {
		distances.push(metersToMiles(bestRoute.routes[0].legs[i].distance.value));

		//based off of previous arrival time if not the first stop
		if (i > 0)
			arrivalSec.push(bestRoute.routes[0].legs[i].duration.value + times[i - 1] + arrivalSec[i - 1]);
		else
			arrivalSec.push(bestRoute.routes[0].legs[i].duration.value);
	}

	//arrival times are adjusted based on start time and converted to clock format
	for (let i = 0; i < arrivalSec.length; i++) {
		arrivalSec[i] = (arrivalSec[i] + startTime) % 86400;
		arrivalTimes[i] = secondsToClock(arrivalSec[i]);
	}

	console.log(distances);
	console.log(arrivalTimes);

	//data is put into an object
	let data = {
		stopOrder: bestRoute.routes[0].waypoint_order,
		distances: distances,
		arrivalTimes: arrivalTimes,
		status: "OK"
	}
	
	//data object is returned in JSON format
	return JSON.stringify(data);
}

//validates all addresses, and turns them into correct format
async function validateAddresses(source, destination, stops) {
	//validates source address
	let sourceCall = await validateAddress(source);
	if (sourceCall.status != 'OK') {
		//ERROR
		return "s";
	}
	source = sourceCall.results[0].formatted_address

	//validates destination address
	let destinationCall = await validateAddress(destination);
	if (destinationCall.status != 'OK') {
		//ERROR
		return "d";
	}
	destination = destinationCall.results[0].formatted_address

	//validates stop addresses
	for (let i = 0; i < stops.length; i++) {
		let stopCall = await validateAddress(stops[i]);
		if (stopCall.status != 'OK') {
			//ERROR
			return i + 1;
		}
		stops[i] = stopCall.results[0].formatted_address
	}

	//no errors
	return 0;
}

//runs the server
app.listen(port,hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});