/**
* A pubsub hub for distributing messages. Supports delegation to other workers and servers
**/
var hub = {};
try{
	// use promise module if available
	var defer = require("promised-io/promise").defer,
		enqueue = require("event-loop").enqueue;
}catch(e){
	if(!defer){
		defer = function(){return {resolve:function(){}}};
	}
	enqueue = function(func){func()};
}
var clientId;
var excludeMatchingClient = true;
exports.getSubscribers = function(){
	return hub;
}
exports.publish= function(channel, message){
	if(!message && typeof channel === "object"){
		message = channel;
		channel = message.channel;
	}
	
	var responses = [];
	var eventName = message.type;
	var publishedToClients = {};
	notifyAll(channel);
	var index = channel.lastIndexOf("/");
    var tagSeparatorIndex = channel.lastIndexOf(":");
    var pathPart = channel.substring(0, index + 1);
    if(tagSeparatorIndex>index){
        var idPart = channel.substring(index+1, tagSeparatorIndex);
        var tagPart = channel.substring(tagSeparatorIndex);
        notifyAll(pathPart+idPart);
        notifyAll(pathPart+"*"+tagPart);
    }
	channel = pathPart;
	notifyAll(channel + "*");
	notifyAll(channel + "**");
	while(channel){
		index = channel.substring(0,channel.length - 3).lastIndexOf("/");
		channel = channel.substring(0, index + 1);
		notifyAll(channel + "**");
	}
	function notifyAll(channel){
		var subscribers = hub[channel];
		if(subscribers){
			if(eventName){
				subscribers = subscribers[eventName];
				if(!subscribers){
					return;
				}
			}
			subscribers.forEach(function(subscriber){
				var subscriberClientId = subscriber._clientId;
				if(!(subscriberClientId instanceof Array)){
					subscriberClientId = subscriberClientId ? [subscriberClientId] : [];
				}
				// check to see if the client id is excluded
				if(excludeMatchingClient === (!clientId ||  
						subscriberClientId.indexOf(clientId) === -1)){
					var deferred = defer();
					responses.push(deferred.promise);
					subscriber.forEach(function(listener){
						enqueue(function(){
							deferred.resolve(listener(message));
						});
					});
				}
			});
		}
	}
	return responses; 
};
		
exports.subscribe= function(channel, /*String?*/eventName, listener){
	var newChannel = false;
	if(typeof eventName === "function"){
		listener = eventName;
		eventName = null;
	}else if(typeof eventName == "string"){
		eventName = [eventName];
	}
	var listeners = listener ? [listener] : [];
	listeners._clientId = clientId;
	var subscribers = hub[channel];
	if(!subscribers){
		subscribers = hub[channel] = [];
		newChannel = true;
	}
	var responses = [];
	if(eventName){
		eventName.forEach(function(eventName){
			if(subscribers[eventName]){
				subscribe(subscribers[eventName], false, eventName);
			}else{
				subscribe(subscribers[eventName] = [], true, eventName);
			}
		}); 
	}else{
		subscribe(subscribers, newChannel);
	}
	function subscribe(subscribers, newChannel, eventName){
		if(newChannel){
			responses.push.apply(responses, exports.publish(channel, {channel:channel, type: "monitored", monitored: true, fortype: eventName}));
		}
		forOnlyOneOtherClient(subscribers, {channel:channel, type: "monitored", monitored: true, fortype: eventName});

		subscribers.push(listeners);
	}

	responses.unsubscribe = function(){
			if(eventName){
				eventName.forEach(function(eventName){
					exports.unsubscribe(channel, eventName, listener);
				});
			}else{
				exports.unsubscribe(channel, listener);
			}
		};
	responses.observe = function(callback){
		listeners.push(callback);
	}
	responses.on = function(event, callback){
		listeners.push(callback);
	}
	return responses;
};

exports.unsubscribe= function(channel, eventName, listener){
	if(typeof eventName === "function"){
		listener = eventName;
		eventName = null;
	}else if(typeof eventName == "string"){
		eventName = [eventName];
	}
	var subscribers = hub[channel];
	if(subscribers){
		if(eventName){
			eventName.forEach(function(eventName){
				unsubscribe(subscribers, eventName);
			});
		}
		else{
			unsubscribe(hub, channel);
		}
	}
	function unsubscribe(hub, channel){
		var subscribers = hub[channel];
		subscribers.splice(subscribers.indexOf(listener), 1);
		if(subscribers.length === 0){
			delete hub[channel];
			exports.publish(channel, {type:"monitored", monitored: false, clientId: listener.clientId, fortype: eventName});
		}else{
			forOnlyOneOtherClient(subscribers, {channel:channel, type: "monitored", monitored: false, fortype: eventName});
		}
	}

};

function forOnlyOneOtherClient(subscribers, message){
	if(subscribers.length > 0){
		var otherClientId = subscribers[0]._clientId;
		if(otherClientId && clientId != otherClientId){
			if(subscribers.every(function(subscriber){
				return otherClientId == subscriber._clientId;
			})){
				clientId = otherClientId;
				excludeMatchingClient = false;
				try{
					exports.publish(message);
				}finally{
					excludeMatchingClient = true;
				}
			}
		}
	}
}

exports.fromClient = function(id){
	var fromClientHub = {};
	var hub = this === global ? exports : this; 
	for(var i in hub){
		fromClientHub[i] = fromClient(hub[i]);
	}
	return fromClientHub;
	function fromClient(action){
		return function(){
			clientId = id;
			try{
				return action.apply(this, arguments);
			}finally{
				clientId = undefined;
			}
		}
	}
}
exports.getMonitored = function(path){
	if(!path){
		return Object.keys(hub).map({
			// TODO: describe the event that is monitored
		}); 
	}
	var paths = [];
	Object.keys(hub).forEach(function(thisPath){
		if(thisPath.substring(0, path.length) === path){
			paths.push(thisPath);
		}
	});
	return paths;
}


exports.getChildHub = function(channel){
	return {
		publish: addPath(exports.publish),
		subscribe: addPath(function(){
			var subscription = exports.subscribe.apply(this, arguments);
			var originalObserve = subscription.observe;
			var originalOn = subscription.on;
			subscription.observe = function(callback){
				originalObserve(function(message){
					if(message.channel.substring(0, channel.length) == channel){
						message.channel = message.channel.substring(channel.length + 1);
					}
					callback(message);
				});
			}
			subscription.on = function(event, callback){
				originalOn(event, function(message){
					if(message.channel.substring(0, channel.length) == channel){
						message.channel = message.channel.substring(channel.length + 1);
					}
					callback(message);
				});
			}
			return subscription;
		}),
		unsubscribe: addPath(exports.unsubscribe),
		fromClient: exports.fromClient,
		getChildHub: addPath(exports.getChildHub),
		getMonitored: addPath(exports.getMonitored)
	};
	function addPath(func){
		return function(subChannel){
			if(typeof subChannel === "object"){
				subChannel.channel = channel + '/' + subChannel.channel;
			}else{
				arguments[0] = channel + '/' + subChannel;
			}
			return func.apply(this, arguments);
		}
	}
}
