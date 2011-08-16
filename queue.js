/**
 * This module provides queuing functionality with distributed message support. 
 */

var connector = require("./connector"),
	hub = require("./hub");

var connections = {};
var hubConnections = [];
var leastRecentlyUsed, mostRecentlyUsed;
var harvesterStarted = false;
exports.expirationTime = 15000;

// this gets a queue that can be used to add events and pull events
exports.getQueue = function(clientId){
	if(clientId){
		if(connections[clientId]){
			return connections[clientId];
		}
		var clientConnection = connections[clientId] = [];
		clientConnection.clientId = clientId;
	}else{
		var clientConnection = []; 
	}
	clientConnection.send = function(message, dontPropagate){
		clientConnection.push(message);
		clientConnection.emit("message", message);
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
				if(this.previous &&  (this.previous.next == this.previous))
					throw new Error("oh no");
			this.next && (leastRecentlyUsed == this) && (leastRecentlyUsed = this.next);
			this.next && (this.next.previous = this.previous);
			this.active = true;
		}else if(this.active){
			// add to inactive queue
			this.lastTouched = new Date().getTime();
			this.active = false;
			if(mostRecentlyUsed && mostRecentlyUsed != this){
				mostRecentlyUsed.next = this;
				if(mostRecentlyUsed.next == mostRecentlyUsed)
					throw new Error("oh no");
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
					while(leastRecentlyUsed && !leastRecentlyUsed.active && leastRecentlyUsed.lastTouched < thresholdTime){
						leastRecentlyUsed.emit("clientClose");
						if(leastRecentlyUsed._onmessage && leastRecentlyUsed._onmessage.length){
							leastRecentlyUsed.timedOut = true;
						}else{
							leastRecentlyUsed.close();
						}
						leastRecentlyUsed = leastRecentlyUsed.next;
					}
				}, 1000);
			}
		}
	},
	connect: function(){
		// connects to the connected set of workers and/or other machines
		var clientId = this.clientId;
		if(clientId){
			hubConnections.forEach(function(connection){
				connection.send({
					requestedClientId: clientId,
					active: true 
				});
			});
			this.observe("clientClose", function(){
				hubConnections.forEach(function(connection){
					connection.send({
						requestedClientId: clientId,
						active: false 
					});
				});
			});
		}
	},
	splice: function(){
		this.setActive(true);
		this.setActive(false);
		return Array.prototype.splice.apply(this, arguments);
	},
	close: function(){
		delete connections[this.clientId];
		if(this.closed){
			return;
		}
		this.closed = true;
		this.emit("close");
	},
	observe: function(name, callback, nonClient){
		var callbacks = this["_on" + name];
		if(!callbacks){
			callbacks = this["_on" + name] = [];
		} 
		callbacks.push(callback);
		if(name === "message" && !nonClient){
			if(!this.startedHere){
				this.connect();
			}
			this.setActive(true);
		}
		var connection = this;
		return {
			dismiss: function(){
				connection.setActive(false);
				callbacks.splice(callbacks.indexOf(callback), 1);
				if(callbacks.length == 0 && connection.timedOut){
					connection.close();
				}
			}
		}
	},
	addListener: function(){
		return this.observe.apply(this, arguments);
	},
	emit: function(name, event){
		var callbacks = this["_on" + name];
		if(callbacks){
			callbacks.forEach(function(callback){
				callback(event);
			});
		}
	}
} 
connectionPrototype.__proto__ = Array.prototype;

connector.observe("connector", function(hubConnection){
	hubConnections.push(hubConnection);
	hubConnection.on("message", function(message){
		if(message.requestedClientId){
			var requestedClientId = message.requestedClientId;
			if(message.active){
				var connection = connections[requestedClientId];
				if(connection){
					var onMessage = function(message){
						if(!message._fromHub){
							hubConnection.send({
								forClientId: requestedClientId,
								message: message
							});
						}
					};
					if(connection.length > 0){
						connection.splice(0, connection.length).forEach(onMessage);
					}
					hubConnection["clientId" + requestedClientId] = connection.observe("message", onMessage, true);
				}
			}else{
				var observer = hubConnection["clientId" + message.requestedClientId];
				if(observer){
					observer.dismiss();
				}else{
					//print("observer for " + message.requestedClientId + " not found");
				}
			}
		}
		if(message.forClientId){
			Object.defineProperty(message.message, "_fromHub", {enumerate: false, value: true});
			connections[message.forClientId].send(message.message, true);
		}
	});
});
