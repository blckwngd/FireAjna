const config = require( "./config.js" );
const AjnaConnector = require( "../AjnaConnector/" );

const ajna = new AjnaConnector( config.firebaseConfig );

ajna.on('objects_retrieved', (objs) => {
  objs.forEach(doc => {
    console.log(doc.data());
  });
});
ajna.observe( {lat: 50.451347, lng: 7.536345}, 1000);