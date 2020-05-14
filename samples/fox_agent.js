
global.firebase = require("@firebase/app").default;
require("@firebase/auth");
require("@firebase/firestore");


const config = require( "./config.js" );
const config_private = require( "./config_private.js" );

const AjnaConnector = require( "../AjnaConnector/" );

const demoObjectId = 'EJ1LQOEPU2is9tFd4ajj';
var demoObject = null;

// bounding box in which the agent will move. adjust to your area.
const bbox = [7.536211, 50.451235, 7.536268, 50.451180];

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

var state = anims.idle;
var speed = 0;
var target = false;

function movement(anim) {
  if ( !target || (anim != anims.idle && state == anims.idle) ) {
    var bbox_width = Math.abs(bbox[2] - bbox[0]);
    var bbox_height = Math.abs(bbox[3] - bbox[1]);
    target = {
      _long: Math.min(bbox[2], bbox[0]) + bbox_width * Math.random(),
      _lat: Math.min(bbox[3], bbox[1]) + bbox_height * Math.random()
    };
  }
  switch( anim ) {
    case anims.walk: speed = 0.8; break;
    case anims.run: speed = 1.6; break;
    default: speed = 0;
  }
  console.log("start moving towards ", target, " with animation " + anim + " (" + speed + "m/s)");
  demoObject.setAnimation( anim );
  if ( anim == anims.idle ) {
    demoObject.stopMoving();
  } else {
    demoObject.startMovingTowards(speed, target);
  }
  state = anim;
}

function redecide() {
  var r = Math.random();
  if (r < 0.5) {
    // stay here for a while
    movement(anims.idle);
    setTimeout(function(){ redecide(); }, 5000);
  } else if (r < 0.8) {
    movement(anims.walk);
  } else {
    movement(anims.run);
  }
}

function startDemoAgent( ) {
  console.log('starting up the fox agent..');
  var data = demoObject.doc.data();
  
  // initially: idle
  movement( anims.idle );
  
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
        movement( anims.idle );
        break;
      case "gehen":
        console.log("gehen: " + (on ? "start" : "stop"));
        movement( on ? anims.walk : anims.idle );
        break;
      case "laufen":
        movement( on ? anims.run : anims.idle );
        break;
      default:
        console.log("unknown action: " + msg.type);
    }
    
    demoObject.consumeMessage( id );
  }.bind(this));
  
  
  demoObject.on('after_tick', function(delta) {
    var dst = demoObject.getDistanceTo(target);
    if (state != anims.idle) {
      console.log("tick done", ` (distance=${dst}m)`);
      if (dst < 2) {
        // close enough
        redecide();
      }
    }
  });
  
  setInterval(function() { ajna.tick(); }, 1000);
}
