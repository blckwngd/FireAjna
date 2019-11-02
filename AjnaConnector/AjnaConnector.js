
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
    this.observed = {
      location: null,
      radius: null
    };

    // Initialize the Firebase SDK
    this.firebase = Firebase;
    this.firebase.initializeApp( firebaseConfig );
    this.firestore = this.firebase.firestore();
    
    // handle logon callback
    this.firebase.auth().onAuthStateChanged(( user ) => {
      if ( this.handler.auth_state_changed ) {
        this.user = user;
        this.handler.auth_state_changed( user );
        this.observe( this.observed.location, this.observed.radius )
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
    this.observed.location = location;
    this.observed.radius = radius;
    
    var snapshot_handler = function(querySnapshot) {// Received query snapshot
      querySnapshot.docs.forEach(doc => {
        this._handleObject( doc );
      });
    };
    
    this.geoquery = this.geocollection
      .near({ center: location, radius: radius });
    // Testobjekt
    //this.geoquery.where('name', '==', 'GeoFireTestObjekt').onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });
    // RULE: !isPermissioned(resource.data.d)
    this.geoquery.where('p', '==', null).onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });
    // RULE: hasAnonymousPerm(resource.data.d, 'r')
    this.geoquery.where('p.a', 'array-contains', 'r').onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });
    // RULE: isOwner()
    if (this.user && this.user.uid) {
      this.geoquery.where('owner', '==', this.user.uid).onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });
    }
    // RULE: hasPublicPerm(resource.data.d, 'read');
//    this.geoquery.where('permissions', '!=', null).where(onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });
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
  
  // create an object in the database.
  createObject (data, onSuccess, onError) {
    // enforce minimal permission entries
    if (!data.p) {
      data.p = {};
    }
    if (!data.p.a || !Array.isArray(data.p.a)) {
      data.p.a = [];
    }
    if (!data.p.r || !Array.isArray(data.p.r)) {
      data.p.r = [];
    }
    this.geocollection.add( data ).then((docRef) => {
      if (onSuccess) onSuccess(docRef);
    }).catch( (error) => {
      console.log('Error: ', error);
      if (onError) onError(error);
    });
  }
  
  // save an object to the database.
  setObject (id, data, onSuccess, onError) {
    var dataObj = {};
    console.log("updating ", data);
    this.geocollection.doc( id ).update( data ).then(() => {
      if (onSuccess) onSuccess();
    }, (error) => {
      console.log('Error: ', error);
      if (onError) onError();
    });
  }
  
  // checks if the user has a specific permission on a given permissionSet
  checkPermission(permissionSet, perm, owner) {
    if(owner && owner===this.user.uid)
      return true;
    if (permissionSet) {
      // anonymous permissions
      if (permissionSet.a && permissionSet.a.includes(perm))
      { console.log('anon permission OK'); return true; }
      // registered-user permissions
      if (this.user.uid && permissionSet.r && permissionSet.r.includes(perm))
      { console.log('registered permission OK'); return true; }
      // user permissions
      if (permissionSet.u && permissionSet.u[this.user.uid] && permissionSet.u[this.user.uid].includes(perm))
      { console.log('user permission OK'); return true; }
      console.log("no matching permission. access denied.");
      return false;
    }
    console.log("no permission to check - granting access.");
    return true;
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
    this.geocollection.doc( this.id ).set( data, { merge: true } );
  }
  
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
   module.exports = AjnaConnector;
else
   window.AjnaConnector = AjnaConnector;