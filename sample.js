
var ajna = new AjnaConnector( config );

/* =============================
   == HANDLE OBSERVED OBJECTS ==
   ============================= */
   
ajna.observe( { lat: 1, lon: 2 }, ( objects ) => {
  // handle available objects
});
ajna.on( 'object_entered', ( object ) => {
  // handle newly appeared object
} );
ajna.on( 'object_changed', ( object, old_object ) => {
  // handle updated object
} );
ajna.on( 'object_left', ( old_object ) => {
  // handle removed object
} );



/* ==================
   == ACT AS AGENT ==
   ================== */

var me = ajna.getObject( 'myObjId' );
me.move( 'forward', 5.0 );
me.on( 'action_triggered', ( sender, name, parameters ) => {
  // $sender triggered action $name on our object
  // post a message back to the sender
  if ( name == 'tickle' ) {
    me.sendTo( sender, "say", { text: 'stop tickling me :-P' } );
  } else {
    me.sendTo( sender, "say", { text: 'I don´t understand.' } );
  }
} );
