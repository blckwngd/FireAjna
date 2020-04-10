const config = require( "./config.js" );
const config_private = require( "./config_private.js" );
const mqtt = require("mqtt");

global.firebase = require("@firebase/app").default;
require("@firebase/auth");
require("@firebase/firestore");

// MQTT
var client  = mqtt.connect( config_private.mqtt_uri );
client.on('connect', function () {
  console.log("mqtt connected");
  client.subscribe('presence', function (err) {
    if (!err) {
      client.publish('presence', 'Hello mqtt')
    }
  })
});
client.on('error', function (err) {
  console.log(err);
});

const AjnaConnector = require( "../AjnaConnector/" );

const demoObjectId = '32iQbukwj4Zia8gNFeFu';
var demoObject = null;

const ajna = new AjnaConnector( config.firebaseConfig );

ajna.login(config_private.username, config_private.password, function(error){
  // an error occured
  console.log("LOGON ERROR");
  console.log(error);
});

ajna.on('auth_state_changed', (user) => {
  if (user) {
    console.log(user.email + " (" + user.uid + ") successfully logged in");
    ajna.queryObject( demoObjectId );
  }
});

ajna.on('object_retrieved', (obj) => {
  console.log("RECEIVED NEW OBJECT: " + obj.id);
  console.log(obj.doc.data());
  if (obj.id == demoObjectId) {
    demoObject = obj;
    startDemoAgent( );
  }
});


function startDemoAgent( ) {
  console.log('starting up the agent..');
  var data = demoObject.doc.data();
  
  // listen for messages sent to the agent
  demoObject.startMessageListener();
  
  demoObject.on('message_received', ( id, msg ) => {
    console.log( msg );
    
    switch (msg.type) {
      case "einschalten":
        console.log("publishing to buerolicht: " + msg.parameters);
        client.publish('buerolicht', msg.parameters);
        break;
      default:
        console.log("unknown action: " + msg.type);
    }
    
    demoObject.consumeMessage( id );
  });
  
}