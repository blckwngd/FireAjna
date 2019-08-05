
class AjnaConnector {

  constructor( firebaseConfig ) {
    
    this.handler = {
      object_retrieved: false,
      auth_state_changed: false,
      object_entered: false,
      object_updated: false,
      object_left: false
    }
    
    this.objects = [];

    // Initialize the Firebase SDK
    this.firebase = require( "firebase/app" );
    require( "firebase/auth" );
    require( "firebase/firestore" );
    this.firebase.initializeApp( firebaseConfig );
    this.firestore = this.firebase.firestore();
    
    // handle logon callback
    this.firebase.auth().onAuthStateChanged(( user ) => {
      if ( this.handler.auth_state_changed ) {
        this.handler.auth_state_changed( user );
      }
    });
    
    // Initialize GeoFireStore
    this.GeoFireStore = require( "geofirestore" );
    this.geofirestore = new this.GeoFireStore.GeoFirestore( this.firestore );
    
    // GeoCollection reference
    this.geocollection = this.geofirestore.collection( 'objects' );
  }
  
  login( username, password, callback ) {
    this.firebase.auth().signInWithEmailAndPassword(username, password).catch(function(error) {
      callback(error);
    });
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
    this.geoquery = this.geocollection.near({ center: new this.firebase.firestore.GeoPoint(50.451347, 7.536345), radius: 10000 });
    this.observer = this.geoquery.onSnapshot(querySnapshot => {
      // Received query snapshot
        querySnapshot.docs.forEach(doc => {
          if (!this.objects[doc.id]) {  
            // retrieved a new (previously unknown) object
            this.objects[doc.id] = new AjnaObject(doc);
            if (this.handler.object_retrieved)
              this.handler.object_retrieved( this.objects[doc.id] );
          } else {
            // received an update for a known object
            this.objects[doc.id].doc = doc;
            if (this.handler.object_updated) {
              this.handler.object_updated( this.objects[doc.id] );
            }
          }
        });
    }, err => {
      console.log( 'Encountered error: ', err );
    });
  }
  
  getObjects( ) {
    return this.objects;
  }
   
   
}

class AjnaObject {
  
  constructor( doc ) {
    
    this.handler = {
      changed: false,
      action_triggered: false,
      message_received: false,
      move: false
    }
    
    this.id = doc.id || false;
    this.doc = doc || false;
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
    this.doc.location = new firebase.firestore.GeoPoint(location.lat, location.lon);
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