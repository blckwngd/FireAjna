class AjnaConnector {

  { GeoCollectionReference, GeoFirestore, GeoQuery, GeoQuerySnapshot } : require('geofirestore');
  
  handler: {
    objects_retrieved: false,
    object_entered: false,
    object_updated: false,
    object_left: false
  }

  constructor( firebaseConfig ) {
    // Initialize the Firebase SDK
    this.firebase = require("firebase/app");
    require("firebase/auth");
    require("firebase/firestore");
    this.firestore = this.firebase.firestore();
    this.firebase.initializeApp(firebaseConfig);
    this.geofirestore: new GeoFirestore(firestore);
    
    // GeoCollection reference
    this.geocollection = this.geofirestore.collection('objects');
  }
  
  /**
   * subscribes to events produced by AjnaConnector
   **/
  on( event, callback ) {
    if ( !( event in this.handler ) )
      throw "unknown event: " + event;
    this.handler[event] = callback;
  }
  
  /**
   * unsubscribes from events
   **/
  off( event ) {
    if ( !( event in this.handler ) )
      throw "unknown event: " + event;
    this.handler[event] = false;
  }
  
  observe( location, radius ) {
    this.geoquery = this.geocollection.near({ center: new firebase.firestore.GeoPoint(50.451347, 7.536345), radius: 10000 });
    this.observer = geoquery.onSnapshot(querySnapshot => {
      // Received query snapshot
      if (this.handler.objects_retrieved) {
        // callback
        this.handler.objects_retrieved( querySnapshot.docs );
      }
    }, err => {
      console.log( 'Encountered error: ${err}' );
    });
  }
  
  getObjects( ) {
    // TODO
  }
   
   
}

class AjnaObject {
  
  id: false;
  obj: false;
  
  handler: {
    changed: false,
    action_triggered: false,
    message_received: false,
    move: false
  }
  
  constructor( obj ) {
    this.id = obj.id;
    this.obj = obj;
  }
  
  /**
   * subscribes to events produced by AjnaConnector
   **/
  on( event, callback ) {
    if ( !( event in this.handler ) )
      throw "unknown event: " + event;
    this.handler[event] = callback;
  }
  
  /**
   * unsubscribes from events
   **/
  off( event ) {
    if ( !( event in this.handler ) )
      throw "unknown event: " + event;
    this.handler[event] = false;
  }
  
  /**
   * moves the object to a specific location, given by latitude and longitude
   **/
  move( location ) {
    this.obj.location = new firebase.firestore.GeoPoint(location.lat, location.lon);
  }
  
  /**
   * sends a message to the objects inbox
   */
  send ( sender, type, message ) {
    // TODO: attach $message of type $type to the objects inbox 
  }
  
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
   module.exports = AjnaConnector;
else
   window.AjnaConnector = AjnaConnector;