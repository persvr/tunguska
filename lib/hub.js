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
	channel = channel.replace(/\/[^\/]$/,'');
	notifyAll(channel + "/*");
	while(channel){
		channel = channel.replace(/\/[^\/]$/,'');
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
				if(!clientId || clientId != subscriber.id){
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
		subscribers = subscribers[eventName];
		if(!subscribers){
			 subscribers = subscribers[eventName] = [];
			 newChannel = true;
		} 
	}
	if(newChannel){
		var responses = exports.publish(channel, {channel:channel, clientId: listener.id, event: "monitored", monitored: true, forEvent: eventName});
	}else{
		var responses = [];
	}
	subscribers.push(listener);

	responses.unsubscribe = function(){
			publish(source, channel, {}, "unsubscribe");
			subscribers.splice(subscribers.indexOf(listener), 1);
		};
	return responses;
};

exports.unsubscribe= function(channel, listener){
	exports.publish({pathInfo:channel}, "unsubscribe");
	subscribers.splice(subscribers.indexOf(listener), 1);
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

 

