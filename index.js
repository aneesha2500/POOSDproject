const http = require('node:http');
const express = require('express');
const fs = require('fs')

const hostname = '10.0.0.249';
const port = 80;
const app = express();


/*
app.post('/hello', (req, res) => {  
req.body; // JavaScript object containing the parse JSON  
res.json(req.body);  
});
*/

app.use(express.json());  

app.post('/trip', (req, res) => {  
console.log("received", req.body);

var user = req.body.username;
//res.json(req.body);
//res.send(user);
res.send(req.body);
res.send("hello this is a successfull POST REQUEST");
res.send(req.body);


});

app.get('/', (request, response) => {
	fs.readFile('./poosd.html', 'utf8', (err, html) => {
	
	if (err) {
		response.status(500).send('sorry, out of order')
	}
	
	response.send(html);
	
	})

	
});

/*
const server = http.createServer((req, res) => {
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/plain');
	res.end('Hello World\n');
	
});
*/


app.listen(port,hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
	
});
