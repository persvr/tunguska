/**
* A connector to other pubsub hubs
**/
var hub = require("./hub");
var callbacks = [];
var connections = [];
exports.on = exports.observe = function(name, callback){
	connections.forEach(callback);
	callbacks.push(callback);
}

exports.Connector = function(clientId, connection){
	connections.push(connection);
	var ourHub = hub.fromClient(clientId);
	ourHub.subscribe("**", "monitored", onSubscription);
	var subscribers = ourHub.getSubscribers();
	for(var channel in subscribers){
		var subs = subscribers[channel];
		for(event in subs){
			var unnamedSent = false;
			if(isNaN(event)){
				onSubscription({
					monitored: true,
					channel: channel,
					fortype: event
				});
			}else if(!unnamedSent){
				unnamedSent = true;
				onSubscription({
					monitored: true,
					channel: channel 
				});
			}
		}
	}
	connection.on("message", function(message){
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
	callbacks.forEach(function(callback){
		callback(connection);
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
	worker = new (require("worker").SharedWorker)("test.js",workerName);
	worker.onmessage = function(event){
		callbacks.forEach(function(callback){
			callback(event.data);
		});
	};
	var callbacks = [];
	var connection = {
		send: function(data){
			worker.postMessage(data);
		},
		observe: function(name, callback){
			callbacks.push(callback);
		}
	};
	exports.Connector("local-workers", connection);
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
