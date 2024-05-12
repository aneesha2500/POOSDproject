const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const hostname = '127.0.0.1';
const apiKey = "API_KEY_HERE";
const port = 80;
const app = express();

/*
MAKE SURE NODE, EXPRESS, AXIOS, AND CORS ARE INSTALLED IN YOUR DIRECTORY

RUN SERVER IN TERMINAL
node server.js

FRONTEND SENDS TO BACKEND IN FOLLOWING FORMAT: 
    src: "2811 Einstein Way, Orlando, FL", //source address
    dest: "4000 Central Florida Blvd, Orlando, FL", //destination address
    stops: ["Miami, FL", "Tampa, FL", "Gainesville, FL"], //array of stop addresses
    times: ["3600", "7200", "10800"], //array of times at each stop in seconds (can be given as string or number)
	travelMode: "DRIVING", //mode of travel
    startTime: "8400" //start time in seconds into the day (can be given as string or number)
	avoidHighways: "false" //optional parameter to avoid highways
	avoidTolls: "false" //optional parameter to avoid tolls

DATA SENT TO FRONTEND IN FOLLOWING FORMAT:
	stopOrder: bestRoute.routes[0].waypoint_order, //array of indicies of stops in order (index 0 for src to stop at index 0, index 1 for stop at index 0 to index 1, etc.)
	distances: distances, //array of distances between stops (index 0 for src to stop at index 0, index 1 for stop at index 0 to index 1, etc.)
	travelTimes: routeTimes, //array of travel times between stops in hours and minutes (index 0 for src to stop at index 0, index 1 for stop at index 0 to index 1, etc.)
	arrivalTimes: arrivalTimes //array of arrival times in clock format (index 0 for arrival at stop at index 0, index 1 for arrival at stop at index 1, etc.)
	totalHours: hrs, //total trip time in hours
	totalMinutes: min, //total trip time in min after the hours
	mapInfo: bestRoute, //full information from google maps API
	status: "" //status of the request described below

STATUS MESSAGES TO FRONTEND:
	status: "OK" - no errors and all fields are valid and filled
	status: "invalid start time" - startTime is not a number
	status: "invalid source address" - incorrect source address 
	status: "invalid destination address"
	status: "invalid route" - error with the route itself - most likely impossible to travel between certain addresses
	status: ("invalid address for stop " + data) - index i - 1 has an invalid address
	status: "times and stops have unequal length" - not exactly one time per stop
	status: ("time for stop " + i + " is not a valid number") - time for stop at index i - 1 is not a valid number
*/

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

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
	if (hours % 24 == 12)
		AmPm = "PM";
	//adjusts if it is midnight
	else if ((hours % 24) == 0) {
		hours = 12;
		AmPm = "AM";
	}

	//adds 0 if minutes is less than 10
	if (minutes < 10)
		return hours + ":0" + minutes + " " + AmPm;
	else
		return hours + ":" + minutes + " " + AmPm;
}

//responds to post request
app.post('/trip', async (req, res) => {  

	console.log("received" + req.body);

	src = req.body.src; //source address
	dest = req.body.dest; //destination address
	stops = req.body.stops; //array of stop addresses
	let times = req.body.times; //array of times at each stop in seconds
	let startTime = parseFloat(req.body.startTime); //start time seconds into the day
	travelMode = req.body.travelMode; //mode of travel
	let avoidHighways = req.body.avoidHighways; //avoid highways
	let avoidTolls = req.body.avoidTolls; //avoid tolls

	console.log(avoidHighways);
	console.log(avoidTolls);

	if (avoidHighways == true && avoidTolls == true) 
		avoidStuff = "tolls|highways";
	else if (avoidHighways == true)
		avoidStuff = "highways";
	else if (avoidTolls == true)
		avoidStuff = "tolls";
	else
		avoidStuff = "";

	console.log(src);
	console.log(dest);
	console.log(stops);
	console.log(times);
	console.log(startTime);
	console.log(travelMode);
	console.log(avoidStuff);

	//validates startTime
	if (isNaN(startTime)) {
		//ERROR
		console.log("error - invalid start time");
		res.send(JSON.stringify({status: "invalid start time"}));
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
			console.log("error - time for stop " + (i + 1) + " is not a valid number");
			res.send(JSON.stringify({status: ("time for stop " + (i + 1) + " is not a valid number")}));
			return;
		}
	}

	//process data
	let data = await receiveRequest(times, startTime);

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
		console.log("error with stop " + data);
		res.send(JSON.stringify({status: ("invalid address for stop " + data)}));
		return;
	}

	//send information to frontend
	res.send(data);
	return;
});

let mapsRequest;
let stops;
let src;
let dest;
let travelMode;
let avoidStuff;

//API call to google maps that gets the best route
const getBestRoute = async () => {
	const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
		params: {
			origin: src, // origin
            destination: dest, // ending point
            waypoints: `optimize:true|${stops.join('|')}`,
            mode: travelMode,
            key: apiKey,
            avoid: avoidStuff
		}
	});

	console.log("API Response: ", response.data); // Check the API response
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
async function receiveRequest(times, startTime) {
	//handle address errors
	let errorCode = await validateAddresses();
	if (errorCode != 0) {
		return errorCode;
	}

	console.log("no errors");

	//get best route
	let bestRoute = await getBestRoute();
	mapsRequest = {
		origin: src, // origin
		destination: dest, // ending point
		waypoints: stops,
		travelMode: travelMode,
		key: apiKey
	};
	bestRoute.request = mapsRequest;

	//initializing arrays for travel times in seconds and in string format, and distances
	let arrivalSec = [];
	let arrivalTimes = [];
	let routeTimes = [];
	let distances = [];
	let tripTime = 0;

	console.log(bestRoute.status)
	if (bestRoute.status != "OK") {
		//ERROR
		return "r";
	}

	//populate arrays with each leg of the route
	for (let i = 0; i < bestRoute.routes[0].legs.length; i++) {
		distances.push(metersToMiles(bestRoute.routes[0].legs[i].distance.value));
		tripTime += bestRoute.routes[0].legs[i].duration.value;

		routeTimes.push(bestRoute.routes[0].legs[i].duration.value);

		//based off of previous arrival time if not the first stop
		if (i > 0)
			arrivalSec.push(bestRoute.routes[0].legs[i].duration.value + times[i - 1] + arrivalSec[i - 1]);
		else
			arrivalSec.push(bestRoute.routes[0].legs[i].duration.value);
	}

	//updating total trip time
	for (let i = 0; i < stops.length; i++) 
		tripTime += times[i];

	//arrival times are adjusted based on start time and converted to clock format
	for (let i = 0; i < arrivalSec.length; i++) {
		routeTimes[i] = (Math.floor(routeTimes[i] / 3600)) + " hours and " + (Math.round((routeTimes[i] % 3600) / 60)) + " minutes";
		arrivalSec[i] = (arrivalSec[i] + startTime) % 86400;
		arrivalTimes[i] = secondsToClock(arrivalSec[i]);
	}

	console.log(distances);
	console.log(arrivalTimes);

	//data is put into an object
	let data = {
		stopOrder: bestRoute.routes[0].waypoint_order,
		distances: distances,
		travelTimes: routeTimes,
		arrivalTimes: arrivalTimes,
		totalHours: Math.floor(tripTime / 3600),
		totalMinutes: Math.round(tripTime % 3600 / 60),
		mapInfo: bestRoute,
		status: "OK"
	}
	
	//data object is returned in JSON format
	return JSON.stringify(data);
}

//validates all addresses, and turns them into correct format
async function validateAddresses() {
	//validates source address
	if (src == "" || src === undefined) {
		//ERROR
		return "s";
	}
	let sourceCall = await validateAddress(src);
	if (sourceCall.status != 'OK') {
		//ERROR
		return "s";
	}
	src = sourceCall.results[0].formatted_address;

	//validates destination address
	if (dest == "" || dest === undefined) {
		//ERROR
		return "d";
	}
	let destinationCall = await validateAddress(dest);
	if (destinationCall.status != 'OK') {
		//ERROR
		return "d";
	}
	dest = destinationCall.results[0].formatted_address;

	//validates stop addresses
	for (let i = 0; i < stops.length; i++) {
		if (stops[i] == "" || stops[i] === undefined) {
			//ERROR
			return i + 1;
		}
		let stopCall = await validateAddress(stops[i]);
		if (stopCall.status != 'OK') {
			//ERROR
			return i + 1;
		}
		stops[i] = stopCall.results[0].formatted_address;
	}

	//no errors
	return 0;
}

//runs the server
app.listen(port, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});