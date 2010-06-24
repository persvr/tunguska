/**
* A connector to other pubsub hubs
**/
var hub = require("./hub");

exports.Connector = function(clientId, connection){
	var ourHub = hub.fromClient(clientId);
	ourHub.subscribe("**", "monitored", onSubscription);
	connection.observe("message", function(message){
		if(typeof message.channel === "string"){
			if(message.method === "subscribe"){
				ourHub.subscribe(message.channel, message.subscribe, function(message){
					connection.send(message);
				});
			}else{
				ourHub.publish(message);
			}
		}
	});
	function onSubscription(message){
		if(message.monitored){
			connection.send({
				method: "subscribe",
				channel: message.channel,
				subscribe: message.fortype || "*"
			});
		}else{
			connection.send({
				method: "unsubscribe",
				channel: channel,
				subscribe: event || "*"
			});
		}
	}
};

exports.WorkerConnector = function(workerName){
	return;
	worker = new SharedWorker("test.js",workerName);
	worker.observe("message", function(event){
		connection.onmessage(event.data);
	});
	var connection = {
		send: function(data){
			worker.postMessage(data);
		}
	};
	exports.WSConnector("local-workers", connection);
}
exports.HttpConnector = function(url){
	
}
/*onmessage = function(event){	
	var request = JSON.parse(event.data);
	var source = event.ports[0];
	var sourceName = source.name;
	var topic = request.pathInfo;
	switch(request.method.toLowerCase()){
		case "post":
			publish(sourceName, topic, request.body);
			break;
				
		case "subscribe":
			subscribe(sourceName, topic, function(){
				source.postMessage();
			});
			break;
			
		case "unsubscribe":
			unsubscribe(sourceName, topic);
	}
	
}*/
