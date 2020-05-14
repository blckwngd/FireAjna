
global.firebase = require("@firebase/app").default;
require("@firebase/auth");
require("@firebase/firestore");


const config = require( "./config.js" );
const config_private = require( "./config_private.js" );

const AjnaConnector = require( "../AjnaConnector/" );

const demoObjectId = 'EJ1LQOEPU2is9tFd4ajj';
var demoObject = null;

const anims = {
  idle: "Survey",
  walk: "Walk",
  run: "Run"
}
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
  console.log('starting up the fox agent..');
  var data = demoObject.doc.data();
  
  // listen for messages sent to the agent
  demoObject.startMessageListener( true );
  
  demoObject.on('message_received', function( id, msg ) {
    console.log( msg );
    var on = (msg.parameters == "true");
    switch (msg.type) {
      case "quickAction":
      case "streicheln":
        console.log("streicheln: " + msg.parameters);
        // reply to the petting
        var reply = (['1','true'].includes(msg.parameters)) ? "awwwwww :3" : "grrrrrrr >.<";
        ajna.sendMessage( msg.sender, 'message', reply, demoObjectId )
        break;
      case "stehen":
        demoObject.setAnimation( anims.idle );
        break;
      case "gehen":
        console.log("gehen: " + (on ? "start" : "stop"));
        demoObject.setAnimation( on ? anims.walk : anims.idle );
        break;
      case "laufen":
        demoObject.setAnimation( on ? anims.run : anims.idle );
        break;
      default:
        console.log("unknown action: " + msg.type);
    }
    
    demoObject.consumeMessage( id );
  }.bind(this));
  
}