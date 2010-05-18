var assert = require("assert");
var hub = require("../lib/hub");

exports.basic = function(test, finished){
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

exports.excludeClient = function(test){
	var listener = function(message){
		assert.fail("Same client should not be called");
	};
	listener.id = "test-client";
	hub.subscribe("foo", listener);
	hub.publish("foo", {
		bar: 3,
		clientId: "test-client"
	});
	hub.unsubscribe("foo", listener);
};

exports.eventType = function(test, finished){
	var listener = function(message){
		assert.equal(message.event, "bar");
		finished();
	};
	hub.subscribe("foo", "bar", listener);
	hub.publish("foo", {
		event: "notbar"
	});
	hub.publish("foo", {
		event: "bar"
	});
	hub.unsubscribe("foo", listener);
};
exports.listenForSubscribe= function(test, finished){
	var count = 0;
	var listener = function(message){
		assert.equal(message.event, "monitored");
		count++;
		if(count == 2){
			finished();
		}
	};
	hub.subscribe("foo", "monitored", listener);
	hub.subscribe("foo", listener);
	hub.unsubscribe("foo", listener);
};
 
if (require.main === module.id){
	try{
		var suite = new (require("http://github.com/bentomas/node-async-testing/raw/master/async_testing.js").TestSuite);
	}catch(e){}
    if(suite){
    	suite.addTests(exports).runTests();
    }else{
    	require("test/runner").run(exports);
    }
}