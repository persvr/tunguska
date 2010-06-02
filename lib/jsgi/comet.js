/**
 * This middleware module provides Comet functionality, helping compensate for
 * browser idionsynchrasies. It also provides a REST Channels implementation. 
 */

var defer = require("promise").defer,
	when = require("promise").when,
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
	var headers = request.headers;
	var clientId = headers["client-id"] || headers["Client-Id"];
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
		clientConnection.onmessage && clientConnection.onmessage();
	}
	clientConnection.__proto__ = connectionPrototype;
	
	//lastUsedQueue.push
	return clientConnection;
};
var startedTimer;
var connectionPrototype = {
	setActive : function(active){
		if(active){
			// remove from inactive queue
			this.previous && (mostRecentlyUsed == this) && (mostRecentlyUsed = this.previous);
			this.previous && (this.previous.next = this.next);
			this.next && (leastRecentlyUsed == this) && (leastRecentlyUsed = this.next);
			this.next && (this.next.previous = this.previous);
		}else{
			// add to inactive queue
			this.lastTouched = new Date().getTime();
			if(mostRecentlyUsed){
				mostRecentlyUsed.next = this;
				this.previous = mostRecentlyUsed;
			}
			mostRecentlyUsed = this;
			if(!startedTimer && global.setInterval){
				startedTimer = true;
				if(!leastRecentlyUsed){
					leastRecentlyUsed = this;
				}
				setInterval(function(){
					var thresholdTime = new Date().getTime() - exports.expirationTime;
					while(leastRecentlyUsed && !leastRecentlyUsed.onmessage && leastRecentlyUsed.lastTouched < thresholdTime){
						leastRecentlyUsed.onclose && leastRecentlyUsed.onclose();
						delete connections[leastRecentlyUsed.clientId];
						leastRecentlyUsed = leastRecentlyUsed.next;
					}
				}, 1000);
			}
		}
	}
} 
connectionPrototype.__proto__ = Array.prototype;
// this is the Comet end-point 
exports.Broadcaster = function(nextApp){
	return function(request){
		nextApp && nextApp(request); // ignore the response
		var headers = request.headers;
		var clientConnection = request.clientConnection || connections[headers["client-id"] || headers["Client-Id"]];
		if(!clientConnection){
			throw new Error("No client connection");
		}
		clientConnection.setActive(true);
		var body;
		if(clientConnection.length){
			body = clientConnection.splice(0, clientConnection.length);
		}else{
			var deferred = defer(function(){
				clientConnection.onclose && clientConnection.onclose();
			});
			clientConnection.onmessage = function(message){
				clientConnection.setActive(false);
				delete clientConnection.onmessage;
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

