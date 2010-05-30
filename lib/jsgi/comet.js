/**
 * This middleware module provides Comet functionality, helping compensate for
 * browser idionsynchrasies. It also provides a REST Channels implementation. 
 */

var defer = require("promise").defer,
	hub = require("../hub");
/**
 * Comet JSGI app factory that allows data to be sent to clients
 */

var connections = {};
var leastRecentlyUsed, mostRecentlyUsed;
var harvesterStarted = false;
exports.expirationTime = 15000;

exports.Notifications = function(path, subscriptions, nextApp){
	if(typeof subscriptions === "function"){
		nextApp = subscriptions;
		subscriptions = null;
	}
	return exports.Connections(
			exports.Broadcaster(path, 
				exports.Subscriber(subscriptions),
				nextApp
			)
		);
};

// this gets a client connection that can be used to add events to the 
// associated connection queue.
exports.getClientConnection = function(request){
	var clientId = request.headers["client-id"];
	if(clientId){
		if(connections[clientId]){
			return connections[clientId];
		}
		var clientConnection = connections[clientId] = [];
		clientConnection.clientId = clientId;
	}else{
		if(request.clientConnection){
			return request.clientConnection;
		}
		var clientConnection = request.clientConnection = []; 
	}
	clientConnection.send = function(message){
		clientConnection.push(message);
		clientConnection.onMessages && clientConnection.onMessages();
	}
	delete clientConnection.next;
	
	if(leastRecentlyUsed === undefined && global.setInterval){
		leastRecentlyUsed = clientConnection;
		setInterval(function(){
			var thresholdTime = new Date().getTime() - exports.expirationTime;
			while(leastRecentlyUsed && !leastRecentlyUsed.onMessages && leastRecentlyUsed.lastTouched < thresholdTime){
				leastRecentlyUsed.onclose && leastRecentlyUsed.onclose();
				delete connections[leastRecentlyUsed.clientId];
				leastRecentlyUsed = leastRecentlyUsed.next;
				delete leastRecentlyUsed.previous;
			}
		}, 1000);
	}
	//lastUsedQueue.push
	return clientConnection;
};

// this is the Comet end-point 
exports.Broadcaster = function(nextApp){
	return function(request){
		var clientConnection = request.clientConnection;
		clientConnection.previous && (clientConnection.previous.next = clientConnection.next);
		clientConnection.next && (clientConnection.next.previous = clientConnection.previous);
		if(!clientConnection){
			clientConnection = request.clientConnection = [];
		}
		nextApp(request); // ignore the response
		var body;
		if(clientConnection.length){
			body = clientConnection.splice(0, clientConnection.length);
		}else{
			var deferred = defer(function(){
				clientConnection.onclose && clientConnection.onclose();
			});
			clientConnection.onMessages = function(message){
				clientConnection.lastTouched = new Date().getTime();
				if(mostRecentlyUsed){
					mostRecentlyUsed.next = clientConnection;
					clientConnection.previous = mostRecentlyUsed;
				}
				mostRecentlyUsed = clientConnection;
				delete clientConnection.onMessages;
				// TODO: maybe queue this up for the next event turn
				deferred.resolve(clientConnection.splice(0, clientConnection.length));
			};
			body = {
				forEach: function(callback){
					return when(deferred.promise, function(messages){
						messages.forEach(callback);
					});
				}
			};
		}
		
		return {
			status: 200,
			headers: {},
			body: body 
		};
	};
}

// this subscribes to stores to listen for events to send through the Broadcaster
exports.Subscriber = function(subscriptions, nextApp){
	return function(request){
		if(nextApp){
			var response = nextApp(request);
		}
		subscriptions = subscriptions || request.body;
		clientConnection = request.clientConnection;
		var clientHub = hub.fromClient(clientConnection.clientId);
		subscriptions.forEach(function(subscription){
			var subscription = clientHub.subscribe(request.pathInfo, function(message){
				clientConnection.send(message);
			});
			clientConnection.onclose = subscription.unsubscribe;
		});
		return response;
		//response.headers.link = '<' + path + '>; rel="hub"'; // we will just define the relationship in the schema
		//return response;
	};
};

