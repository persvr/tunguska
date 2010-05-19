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

// this adds a clientConnection property that can be used to add events to the 
// associated connection queue.
exports.Connections = function(nextApp){
	return function(request){
		var clientId = request.headers["client-id"];
		if(clientId){
			var clientConnection = connections[clientId];
			if(clientConnection){
				request.clientConnection = clientConnection; 
			}else{
				request.clientConnection = clientConnection = connections[clientId] = [];
				clientConnection.clientId = clientId;
				clientConnection.send = function(message){
					clientConnection.push(message);
					clientConnection.onMessages && clientConnection.onMessages();
				}
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
			lastUsedQueue.push
		}
		return nextApp(request);
	};
};

// this is the Comet end-point 
exports.Broadcaster = function(path, subscriptionApp, nextApp){
	return function(request){
		if(request.pathInfo !== path){
			return nextApp(request);
		}
		var clientConnection = request.clientConnection;
		clientConnection.previous && (clientConnection.previous.next = clientConnection.next);
		clientConnection.next && (clientConnection.next.previous = clientConnection.previous);
		if(!clientConnection){
			clientConnection = request.clientConnection = [];
		}
		subscriptionApp(request); // ignore the response
		if(clientConnection.length){
			return sendAllMessages();
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
				deferred.resolve(drain());
			};
			return deferred.promise;
		}
		function sendAllMessages(){
			return {
				status: 200,
				headers: {},
				body: clientConnection.splice(0, clientConnection.length) 
			};
		}
	};
}

// this subscribes to stores to listen for events to send through the Broadcaster
exports.Subscriber = function(subscriptions, nextApp){
	return function(request){
		if(nextApp){
			var response = nextApp(request);
		}
		subscriptions = subscriptions || request.input;
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

