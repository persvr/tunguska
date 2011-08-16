/**
 * This middleware module provides Comet functionality, helping compensate for
 * browser idionsynchrasies. It also provides a REST Channels implementation. 
 */

var getQueue = require("../queue").getQueue,
	hub = require("../hub");


// this gets a client connection that can be used to add events to the 
// associated connection queue.
exports.getClientConnection = function(request){
	if(request.clientConnection){
		return request.clientConnection;
	}
	var headers = request.headers;
	var clientId = headers && (headers["client-id"] || headers["Client-Id"]) || Math.random();
	if(clientId){
		var clientConnection = request.clientConnection = getQueue(clientId);
		if(headers && (headers["pragma"] == "start-long-poll")){
			clientConnection.startedHere = true;
		}
		return clientConnection;
	}
};

// this is the Comet end-point 
exports.Broadcaster = function(nextApp){
	return function(request){
		nextApp && nextApp(request); // ignore the response
		var headers = request.headers;
		var streaming = !!headers.stream;
		var clientConnection = exports.getClientConnection(request);
		if(!clientConnection){
			throw new Error("No client connection");
		}
		var body;
		if(clientConnection.length){
			body = clientConnection.splice(0, clientConnection.length);
		}else{
			body = {
				forEach: function(callback){
					if(clientConnection.length){
						clientConnection.splice(0, clientConnection.length).forEach(callback);
						if(!streaming){
							return;
						}
					}
					var promiseCallback;
					var observer = clientConnection.observe("message", function(message){
						// TODO: maybe queue this up for the next event turn
						clientConnection.splice(0, clientConnection.length).forEach(callback);
						if(promiseCallback){
							observer.dismiss();
							promiseCallback();
						}
					});
					return {
						then: function(callback, errback){
							if(!streaming){
								promiseCallback = callback;
							}
						},
						cancel: function(){
							clientConnection.close();
						}
					}
				}
			};
		}
		
		return {
			status: 200,
			headers: {},
			body: body 
		};
	};
};

// this subscribes to stores to listen for events to send through the Broadcaster
exports.Subscriber = function(subscriptions, nextApp){
	return function(request){
		if(nextApp){
			var response = nextApp(request);
		}
		subscriptions = subscriptions || request.body;
		var clientConnection = exports.getClientConnection(request);
		if(!clientConnection){
			throw new Error("No client connection");
		}
		var clientHub = hub.fromClient(clientConnection.clientId);
		subscriptions.forEach(function(subscription){
			var subscription = clientHub.subscribe(subscription, function(message){
				clientConnection.send(message);
			});
			clientConnection.onclose = subscription.unsubscribe;
		});
		return response;
		//response.headers.link = '<' + path + '>; rel="hub"'; // we will just define the relationship in the schema
		//return response;
	};
};

/**
 * Comet JSGI app factory that allows data to be sent to clients
 */
exports.Notifications = function(subscriptions, nextApp){
	if(typeof subscriptions === "function"){
		nextApp = subscriptions;
		subscriptions = null;
	}
	return exports.Broadcaster(
					exports.Subscriber(subscriptions),
						nextApp
					);
};
