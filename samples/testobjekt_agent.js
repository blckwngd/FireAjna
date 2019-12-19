const config = require( "./config.js" );
const mqtt = require("mqtt");


var client  = mqtt.connect( config.mqtt_uri );
client.on('connect', function () {
  console.log("mqtt connected");
  client.subscribe('presence', function (err) {
    if (!err) {
      client.publish('presence', 'Hello mqtt')
    }
  })
})
client.on('error', function (err) {
  console.log(err);
})


//const GeoFirestore = require( "geofirestore" ).GeoFirestore;  
const AjnaConnector = require( "../AjnaConnector/" );

const demoObjectId = '32iQbukwj4Zia8gNFeFu';
var demoObject = null;

const ajna = new AjnaConnector( config.firebaseConfig );

ajna.login(config.username, config.password, function(error){
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

ajna.on('object_updated', (obj) => {
  console.log("UPDATED OBJECT: " + obj.id);
});

// ajna.observe( ajna.GeoPoint( 50.451347, 7.536345 ), 1000);


function tickDemoAgent( ) {
  console.log('tick...');
  
  // move
  // demoObject.moveForward(1);
  
  // act
  /*demoObject.set({
    description: "random data: " + Math.random()
  });*/
}

function startDemoAgent( ) {
  console.log('starting up the agent..');
  var data = demoObject.doc.data();
  
  // listen for messages sent to the agent
  demoObject.startMessageListener();
  demoObject.on('message_received', ( id, msg ) => {
    console.log( msg );
    
    switch (msg.type) {
      case "testaction":
        client.publish('scene', (msg.parameters=='true' ? 'fernsehzeit' : 'gutenacht'));
        break;
      default:
        console.log("unknown action: " + msg.type);
    }
    
    demoObject.consumeMessage( id );
  });
  
  // observe the world with a radius of 100m
  // ajna.observe( data.coordinates, 100);
  
  // let the agent act
  // setInterval(tickDemoAgent, 5000);
  // tickDemoAgent();
  
}