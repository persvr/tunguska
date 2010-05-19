[Tunguska](http://en.wikipedia.org/wiki/Tunguska_event) is a comet-based 
distributed publish/subscribe hub for server side JavaScript (Node, Rhino/Narwhal).
Tunguska is publish subscribe framework for 
building applications around a publish-subscribe system with real-time message delivery
to browsers. Tunguska consists of several modules:

lib/hub.js
==========

This is the actual publish-subscribe hub. The hub is a simple, easy to use set of channels
for publishing and listening for events, but includes some powerful features. To use the
hub, simply require the hub.js module to get the hub object. If you installed Tunguska
such that lib/hub.js is available through the tunguska path:

    var hub = require("tunguska/hub");

If you are using [Nodules](http://github.com/kriszyp/nodules) you can map to tunguska
by adding this line to your package.json (And Tunguska will automatically be downloaded for you):

    "mappings": {
	  "tunguska": "jar:http://github.com/kriszyp/tunguska/zipball/master!/lib/"
    }

Now to subscribe to a channel:

    hub.subscribe("name/of/channel", function listenerFunction(message){
        // do something with the messages that are received
    });

To publish to a channel:

    hub.publish("name/of/channel", {foo:"bar"});
    
And to unsubscribe:

    hub.unsubscribe("name/of/channel", listenerFunction);

Tunguska supports wildcarding/globbing for subscriptions. We can subscribe to a set
of channels like:

    hub.subscribe("name/of/*", listenerFunction);

or we can use double asterisk for recursive wildcard, to subscribe to everything:

    hub.subscribe("**", listenerFunction);

Tunguska also supports named event sub-types within each channel. For example,
we could choose to only listen to the "system" messages on a channel:

    hub.subscribe("name/of/channel", "system", systemListener);
 
And we can define name of events with the "event" property in our published 
messages. For example:

    hub.publish("name/of/channel", {event:"system"}); // will fire systemListener
    hub.publish("name/of/channel", {event:"chat"}); // will not fire systemListener

Tunguska itself fires a special "monitored" event whenever a channel has one or more subscribers, and
whenever a channel becomes free of any subscribers. For example:

    hub.subscribe("name/of/channel", "monitored", function(message){
      if(message.monitored){
        // name/of/channel has at least one subscriber now
      }else{
        // name/of/channel has no subscribers now
      }
    });

(This is used by the connector) 
    
Tunguska provides echo suppression by defining client identities. This is an important
feature for distributed pubsub because it allows you to define efficient message routing
without messages bouncing back and forth. To define a client identity, you can set
an "clientId" property on the listener function provided to a subscribe call:

    function listenerFunction(message){
        // do something with the messages that are received
    }
    listenerFunction.clientId = "client-1";
    hub.subscribe("name/of/channel", listenerFunction);

The clientId property may be an array if there are a list of client of client identities that 
should be excluded.

Now when we publish a message, we can also define the identity of the client with the
"clientId" property in the message. A message with a "clientId" will be withheld from
any listener with a matching id. For example:

    hub.publish("name/of/channel", {clientId:"client-1"}); // will not fire the listenerFunction
    hub.publish("name/of/channel", {clientId:"client-2"}); // will fire the listenerFunction
    
lib/comet.js
============

This module consists of several JSGI appliances.

lib/connector.js
============
