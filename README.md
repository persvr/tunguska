[Tunguska](http://en.wikipedia.org/wiki/Tunguska_event) is a comet-based 
distributed publish/subscribe hub for server side JavaScript (Node, Rhino/Narwhal).
Tunguska is publish subscribe framework for building applications around a 
publish-subscribe system with real-time message delivery
to browsers. An introduction to Tunguska can be [found here](http://www.sitepen.com/blog/2010/07/19/real-time-comet-applications-on-node-with-tunguska/).
Tunguska consists of several modules:

lib/hub.js
========

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

Return Values
-------------

Calls to publish, subscribe, and unsubscribe will return an array of promises that 
represent the eventual return value from each subscriber. One can therefore determine
when all the messages have been delivered, and if there was failures. In a distributed
environment, the return value from subscription requests can be monitored to determine when the subscription
has been distributed to all hubs.

Globbing/Wildcards
-----------------

Tunguska supports wildcarding/globbing for subscriptions. We can subscribe to a set
of channels like:

    hub.subscribe("name/of/*", listenerFunction);

or we can use double asterisk for recursive wildcard, to subscribe to everything:

    hub.subscribe("**", listenerFunction);

In addition, we can use tagged subscriptions to subscribe to a subset of tagged messages on a channel:

    hub.subscribe("name/of/*:tagname", listenerFunction);

Using tags requires that objects are published with a tag:

    hub.publish("name/of/channel:tagname", {foo:"bar"});

Messages that are published with a tag will be sent to all subscribers that are subscribed to a matching tag, or that are subscribed to the base channel without a tag.

Tunguska also supports named event sub-types within each channel. The subscribe
function takes an optional second parameter for specifying a specific event type
to listen for. For example,
we could choose to only listen to the "system" messages on a channel:

    hub.subscribe("name/of/channel", "system", systemListener);
 
Named Events
-------------

And we can define name of the type of events with the "type" property in our published 
messages. For example:

    hub.publish("name/of/channel", {type:"system"}); // will fire systemListener
    hub.publish("name/of/channel", {type:"chat"}); // will not fire systemListener

Tunguska itself fires a special "monitored" event whenever a channel has one or more subscribers, and
whenever a channel becomes free of any subscribers. For example:

    hub.subscribe("name/of/channel", "monitored", function(message){
      if(message.monitored){
        // name/of/channel has at least one subscriber now
      }else{
        // name/of/channel has no subscribers now
      }
    });

(This is used by the connectors) 

Client Identity/Echo Suppression
-----------------------------
    
Tunguska provides echo suppression by defining client identities. This is an important
feature for distributed pubsub because it allows you to define efficient message routing
without messages bouncing back and forth. To define a client identity, you can call
fromClient with a client id, which will return a new hub interface which will
suppress all messages from this client. :

    
    hub.fromClient("client-1").subscribe("name/of/channel", function listenerFunction(message){
        // do something with the messages that are received
    });

The clientId property may be an array if there are a list of client of client identities that 
should be excluded.

The hub interface returned from the fromClient call can also be used to publish messages.
A message with a from a client will be withheld from any listener defined through that 
client. For example:

    hub.fromClient("client-1").publish("name/of/channel", {name:"msg-1"}); // will not fire the listenerFunction above
    hub.fromClient("client-2").publish("name/of/channel", {name:"msg-2"}); // will fire the listenerFunction
    
lib/jsgi/comet.js
============

This module consists of several JSGI appliances.

* require("tunguska/jsgi/comet").Connections(nextApp) - This a middleware appliance for creating and
using a pool of client connection entities that can be shared across requests. This can
be useful to use directly if non-comet requests may add or alter subscriptions for 
another comet connection that shares the same virtual connection entity. Connections
are defined by including a "Client-Id" header in a request. All requests that share the
same Client-Id share the same connection object. The nextApp is called after connection
handling. 

Connections are available within downstream JSGI applications from 
request.clientConnection. The connection queue object has the following properties/methods:
** send(message) - This can be called to send a message to any connected client
** onclose() - This event is called/triggered when a connection is closed  

* require("tunguska/jsgi/comet").Broadcaster(path, subscriptionApp, nextApp) - This 
provides a comet end-point. A request that matches the path will be handled by the
Broadcaster and any messages in the client connection queue will be sent to the client,
or if the connection queue is empty, it will wait until a message is sent to the connection
and the broadcaster will deliver the message to the client. When the path is matched,
the subscriptionApp will be called next and can handle defining any subscriptions that
should be made (to the hub) and routing received messages to the connection queue.
If the path is not matched, the nextApp is called.      

* require("tunguska/jsgi/comet").Subscriber(subscriptions, nextApp) - This is a 
subscription handling appliance that will either use list of subscriptions provided in the 
setup argument, or if the subscriptions argument is omitted, any subscriptions 
provided in the request, and subscribes to given channels on the hub, and forwards any received messages
to the connection queue object.

* require("tunguska/jsgi/comet").Notifications(path, subscriptions, nextApp) - This combines
all three middleware appliance above into a single middleware appliance. The path defines
the comet end-point. The subscriptions parameter is optional and can specify the set
of channels to subscribe to. The nextApp is called for requests that don't match the path.
 
Connectors
=========

Connectors provide a means for connecting hubs in different processes and on 
different machines, thus allowing for distributed publish/subscribe systems. Connectors
are provided for worker-based communication, WebSocket communication 
(and in the future, HTTP-based communication) between hubs. The connectors 
communicate through a framed stream, following the 
WebSocket API. One can easily use a WebSocket connection or one can use the 
framed stream connection provided by multi-node for connecting processes. Here
is an example of connecting the processes initiated by multi-node for distributed 
pub/sub across all the processes:

    var multiNode = require("multi-node/multi-node"),
        Connector = require("tunguska/connector").Connector;
    // start the multiple processes
    var nodes = multiNode.listen({port: 80, nodes: 4}, serverObject);
    // add a listener for each connection to the other sibling process
    nodes.addListener("node", function(stream){
      // create a new connector using the framed WS stream
      Connector("local-workers", multiNode.frameStream(stream));
    });

The Connection constructor takes two arguments:

    Connector(connectionId, framedWebSocketStream);

The connectionId identifies the source of the messages, and utilizes echo suppression
to route messages properly. A message that is broadcast from one connection won't
get rerouted back to the same connector/client causing duplicate messages. The 
second argument is the framed stream that follows the WebSocket API. 

One can utilize different connectionIds to connect different networks for more sophisticated
topologies. For example, one could have a set of connectors for local processes with one id ("local-workers"),
and a connector for a remote server with another id ("servers"). A message received the other
server would not be echoed back to that server, but it would properly get routed to 
the local worker processes.