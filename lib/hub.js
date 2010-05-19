/**
* A pubsub hub for distributing messages. Supports delegation to other workers and servers
**/
var hub = [];
try{
	var defer = require("promise").defer,
		enqueue = require("event-loop").enqueue;
}catch(e){
	if(!defer){
		defer = function(){return {resolve:function(){}}};
	}
	enqueue = function(func){func()};
}
var clientId;
var excludeMatchingClient = true;
exports.publish= function(channel, message){
	if(!message && typeof channel === "object"){
		channel = channel.channel;
		message = channel;
	}
	var responses = [];
	var eventName = message.type;
	var publishedToClients = {};
	notifyAll(channel);
	var index = channel.lastIndexOf("/");
	channel = channel.substring(0, index + 1);
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
				if(subscriberClientId.some(function(subscriberClientId){
					if(publishedToClients[subscriberClientId]){
						// only send to a client once
						return true;
					}
					// add to list of published to clients
					publishedToClients[subscriberClientId] = true;
				})){
					return;
				}
				// check to see if the client id is excluded
				if(excludeMatchingClient === (!clientId ||  
						subscriberClientId.indexOf(clientId) === -1)){
					var deferred = defer();
					responses.push(deferred.promise);					
					enqueue(function(){
						deferred.resolve(subscriber(message));
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
	}
	listener._clientId = clientId;
	var subscribers = hub[channel];
	if(!subscribers){
		subscribers = hub[channel] = [];
		newChannel = true;
	}
	
	if(eventName && eventName != "*"){
		if(subscribers[eventName]){
			subscribers = subscribers[eventName];
		}else{
			subscribers = subscribers[eventName] = [];
			newChannel = true;
		} 
	}
	if(newChannel){
		var responses = exports.publish(channel, {channel:channel, type: "monitored", monitored: true, fortype: eventName});
	}else{
		var responses = [];
	}
	forOnlyOneOtherClient(subscribers, {channel:channel, type: "monitored", monitored: true, fortype: eventName});

	subscribers.push(listener);

	responses.unsubscribe = function(){
			if(eventName){
				exports.unsubscribe(channel, eventName, listener);
			}else{
				exports.unsubscribe(channel, listener);
			}
		};
	return responses;
};

exports.unsubscribe= function(channel, eventName, listener){
	if(typeof eventName === "function"){
		listener = eventName;
		eventName = null;
	}
	var subscribers = hub[channel];
	if(subscribers){
		if(eventName && eventName != "*"){
			subSubscribers = subscribers[eventName];
			if(subSubscribers){
				subSubscribers.splice(subscribers.indexOf(listener), 1);
				if(subSubscribers.length === 0){
					delete subscribers[eventName];
					exports.publish(channel, {type:"monitored", fortype: eventName, monitored: false});
				}else{
					forOnlyOneOtherClient(subSubscribers, {channel:channel, type: "monitored", monitored: false, fortype: eventName});
				}
				
			}
		}
		else{
			subscribers.splice(subscribers.indexOf(listener), 1);
			if(subscribers.length === 0){
				exports.publish(channel, {type:"monitored", monitored: false, clientId: listener.clientId});
			}else{
				forOnlyOneOtherClient(subscribers, {channel:channel, type: "monitored", monitored: false});
			}
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
	for(var i in exports){
		fromClientHub[i] = fromClient(exports[i]);
	}
	return fromClientHub;
	function fromClient(action){
		return function(){
			clientId = id;
			try{
				action.apply(this, arguments);
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
		subscribe: addPath(exports.subscribe),
		unsubscribe: addPath(exports.unsubscribe),
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
