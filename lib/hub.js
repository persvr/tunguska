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
exports.publish= function(channel, message){
	if(arguments.length === 1){
		channel = channel.channel;
		message = channel;
	}
	var responses = [];
	var eventName = message.event;
	var clientId = message.clientId;
	notifyAll(channel);
	channel = channel.indexOf("/") > -1 ? channel.replace(/\/[^\/]$/,'') : "";
	notifyAll(channel + "/*");
	while(channel){
		channel = channel.indexOf("/") > -1 ? channel.replace(/\/[^\/]$/,'') : "";
		notifyAll(channel + "/**");
	}
	function notifyAll(subscribers){
		var subscribers = hub[channel];
		if(subscribers){
			if(eventName){
				subscribers = subscribers[eventName];
				if(!subscribers){
					return;
				}
			}
			subscribers.forEach(function(subscriber){
				if(!clientId || (subscriber.clientId instanceof Array ? 
						subscriber.clientId.indexOf(clientId) === -1 : clientId != subscriber.clientId)){
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
		var responses = exports.publish(channel, {channel:channel, clientId: listener.clientId, event: "monitored", monitored: true, forEvent: eventName});
	}else{
		var responses = [];
	}
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
					exports.publish(channel, {event:"monitored", forEvent: eventName, monitored: false, clientId: listener.clientId});
				}
			}
		}
		else{
			subscribers.splice(subscribers.indexOf(listener), 1);
			if(subscribers.length === 0){
				exports.publish(channel, {event:"monitored", monitored: false, clientId: listener.clientId});
			}
		}
	}
};

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
			arguments[0] = channel + '/' + subChannel;
			return func.apply(this, arguments);
		}
	}
}

 

