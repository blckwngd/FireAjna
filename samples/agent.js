const config = require( "./config.js" );
const AjnaConnector = require( "../AjnaConnector/" );

const ajna = new AjnaConnector( config.firebaseConfig );
ajna.login(config.username, config.password, function(error){
  // an error occured
  console.log("LOGON ERROR");
  console.log(error);
});

ajna.on('auth_state_changed', (user) => {
  if (user) {
    console.log(user.email + " successfully logged in");
  }
});

ajna.on('object_retrieved', (obj) => {
  console.log("RECEIVED NEW OBJECT: " + obj.id);
  console.log(obj.doc.data());
});

ajna.on('object_updated', (obj) => {
  console.log("UPDATED OBJECT: " + obj.id);
  console.log(obj.doc.data());
});

ajna.observe( {lat: 50.451347, lng: 7.536345}, 1000);