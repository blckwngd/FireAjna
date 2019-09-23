
class AjnaConnector {

  constructor( firebaseConfig, Firebase, GeoFirestore ) {
    
    this.handler = {
      object_retrieved: false,
      auth_state_changed: false,
      object_entered: false,
      object_updated: false,
      object_left: false
    }
    
    this.objects = [];
    this.user = false;

    // Initialize the Firebase SDK
    this.firebase = Firebase;
    this.firebase.initializeApp( firebaseConfig );
    this.firestore = this.firebase.firestore();
    
    // handle logon callback
    this.firebase.auth().onAuthStateChanged(( user ) => {
      if ( this.handler.auth_state_changed ) {
        this.user = user;
        this.handler.auth_state_changed( user );
      }
    });
    
    // Initialize GeoFireStore
    this.geofirestore = new GeoFirestore( this.firestore );
    
    // GeoCollection reference
    this.geocollection = this.geofirestore.collection( 'objects' );
  }
  
  login( username, password, callback ) {
    this.firebase.auth().signInWithEmailAndPassword(username, password).catch(function(error) {
      callback(error);
    });
  }
  
  logout( ) {
    this.firebase.auth().signOut();
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
  
  // handle an object received from geofirestore
  _handleObject( doc ) {
    if (!this.objects[doc.id]) { 
      // retrieved a new (previously unknown) object
      this.objects[doc.id] = new AjnaObject(doc, this.geocollection);
      if (this.handler.object_retrieved)
        this.handler.object_retrieved( this.objects[doc.id] );
    } else {
      // received an update for a known object
      this.objects[doc.id].doc = doc;
      if (this.handler.object_updated) {
        this.handler.object_updated( this.objects[doc.id] );
      }
    }
  }
  
  GeoPoint( latitude, longitude ) {
    return new this.firebase.firestore.GeoPoint(latitude, longitude);
  }
  
  observe( location, radius ) {
    console.log( "observing ", location );
    console.log( "Radius: " + radius );
    this.geoquery = this.geocollection.near({ center: location, radius: radius });
    this.observer = this.geoquery.onSnapshot(querySnapshot => {
      // Received query snapshot
        querySnapshot.docs.forEach(doc => {
          this._handleObject( doc );
        });
    }, err => {
      console.log( 'Encountered error: ', err );
    });
  }
  
  getObjects( ) {
    return this.objects;
  }
  
  // get a loaded object by id
  getObject( id ) {
    if (id in this.objects)
      return this.objects[id];
    else
      return false;
  }
  
  // load an object from the database by id
  queryObject( id ) {
    this.geocollection.doc( id ).get().then(doc => {
      this._handleObject( doc );
    })
  }
  
  createObject( location, data ) {
    owner = this.user.id;
  }

}

class AjnaObject {
  
  constructor( doc, geocollection ) {
    
    this.handler = {
      changed: false,
      action_triggered: false,
      message_received: false,
      move: false
    }
    
    this.id = doc.id || false;
    this.doc = doc || false;
    this.geocollection = geocollection;
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
  
  set( data ) {
    console.log("setting data; owner=" + this.doc.data().owner);
    this.geocollection.doc( this.id ).set( data, { merge: true } );
  }
  
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
   module.exports = AjnaConnector;
else
   window.AjnaConnector = AjnaConnector;