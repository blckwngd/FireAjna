const config = require( "./config.js" );

var Firebase = require( "firebase/app" );
require( "firebase/auth" );
require( "firebase/firestore" );
    
const AjnaConnector = require( "../AjnaConnector/" );

const demoObjectId = '32iQbukwj4Zia8gNFeFu';
var demoObject = null;

const ajna = new AjnaConnector( 
  config.firebaseConfig,
  Firebase,
  require( "geofirestore" )
);

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
  // act
  demoObject.set({
    description: "random data: " + Math.random()
  });
}

function startDemoAgent( ) {
  console.log('starting up the agent..');
  var data = demoObject.doc.data();
  ajna.observe( data.coordinates, 100);
  setInterval(tickDemoAgent, 5000);
  tickDemoAgent();
}