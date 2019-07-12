# FireAjna
Ajna ecosystem - running on Firebase


## AjnaConnector - the JS package
usable in browser and from NodeJS.

### properties

 - firebase: the FireBase object
 - firestore: the FireStore object for firebase
 - geofirestore: the GeoFireStore object for firestore
 
### methods

 - AjnaConnector(): Contructor
 - login(): authenticates the user with username and password
 - loginService(): authenticates the user with a firebase service account
 - observe(): sets the observed geographic area
 - getObjects(): gets a reference to all available observed objects
 - getObject(): gets a reference to a unique object
 - triggerAction(): triggers an action on a given object
 - createObject(): creates a new object in the datastore
 - moveObject(): moves an object to another location
 - updateObject(): changes an objects data
 - deleteObject(): deletes an object
 - message(): sends a message to an objects inbox
 
### events

 - object_entered: a new object arrived in the observed area
 - object_changed: an observed object has changed its data (i.e. its position)
 - object_left: an object has been removed, or moved out of the observed area

## AjnaObject
represent an georeferenced object within the Firestore

### properties
 - id: the objects Firebase-id

### methods
 - on(): subscribes to a given event
 - off(): unsubscribes from a previously subscribed event
 - move(): move relatively, or to an absolute position
 - send(): sends a message to the objects inbox
 - sendTo(): initiates a message, using the object as a sender, to another objects inbox


## Code Sample

```javascript
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
```
