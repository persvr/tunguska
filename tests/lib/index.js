// helpful for debugging
var Static = require("pintura/jsgi/static").Static,
	comet = require("tunguska/jsgi/comet"),
	hub = require("tunguska/hub"),
	jsgiApp = require("pintura/jsgi/cascade").Cascade([ 
		// cascade from static to pintura REST handling
			// the main place for static files accessible from the web
			Static({urls:[""], root: "public", directoryListing: true}),
			comet.Notifications(["test"])
		]),


	ws = require("ws/server"),
	http = require("http").createServer(
			require("jsgi-node/jsgi-node").Listener(jsgiApp)
	);
	var wsServer = ws.createServer({
		server: http
	});
	require("jsgi-node/ws-jsgi")(wsServer, function(request){
		request.headers.stream = true;
		return jsgiApp(request);
	});
	http.listen(8080);
setInterval(function(){
	hub.publish("test", "hi there");
}, 2000);