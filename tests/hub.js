var assert = require("assert");
var hub = require("../lib/hub");

exports.testBasic = function(finished){
	var listener = function(message){
		assert.equal(message.bar, 3);
		finished();
	}
	hub.subscribe("foo", listener);
	hub.publish("foo", {
		bar: 3
	});
	hub.unsubscribe("foo", listener);
	hub.publish("foo", {
		bar: 5
	});
};

exports.testExcludeClient = function(){
	var listener = function(message){
		assert.fail("Same client should not be called");
	};
	clientHub = hub.fromClient("test-client");
	clientHub.subscribe("foo", listener);
	clientHub.publish("foo", {
		bar: 3
	});
	clientHub.unsubscribe("foo", listener);
};

exports.testEventType = function(finished){
	var listener = function(message){
		assert.equal(message.type, "bar");
		finished();
	};
	hub.subscribe("foo", "bar", listener);
	hub.publish("foo", {
		type: "notbar"
	});
	hub.publish("foo", {
		type: "bar"
	});
	hub.unsubscribe("foo", listener);
};
exports.listenForSubscribe= function(finished){
	var count = 0;
	var listener = function(message){
		assert.equal(message.type, "monitored");
		count++;
		if(count == 2){
			finished();
		}
	};
	hub.subscribe("foo", "monitored", listener);
	hub.subscribe("foo", listener);
	hub.unsubscribe("foo", listener);
};

print = require("system").print;
if (require.main === module){
	for(var i in exports){
		if(i.substring(0,4) == "test"){
			var test = exports[i];
			print(i + " started");
			try{
				test.length > 0 ? test(function(){
					print(i + " finished ");
				}) : (test() & print(i + " finished"));
			}catch(e){
				print(i + " failed: " + e.stack);
			}
		}
	}
}