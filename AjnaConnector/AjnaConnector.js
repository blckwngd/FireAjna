
class AjnaConnector {

  constructor( firebaseConfig ) {
    
    this.handler = {
      object_retrieved: false,
      auth_state_changed: false,
      object_entered: false,
      object_updated: false,
      object_left: false,
      heightmap_updated: false
    }
    
    this.objects = [];
    this.user = false;
    this.observed = {
      location: null,
      radius: null
    };
    
    // Mapbox access token
    this.mapboxToken = "MAPBOX_TOKEN";

    // handle requires for web and nodejs
    if( typeof turf == "undefined" ) {
      this.turf = require('@turf/turf');
      this.transformTranslate = require("@turf/transform-translate");
    } else {
      this.turf = turf;
      this.transformTranslate = turf.transformTranslate;
    }
    
    this.axios = (typeof axios != "undefined") ? axios : require( "axios" );
    this.getPixels = (typeof getPixels != "undefined") ? getPixels : require( "get-pixels" );
    
    var GFS = (typeof GeoFirestore == "undefined") ? require( "geofirestore" ).GeoFirestore : GeoFirestore;
    
    if( typeof firebase == "undefined" ) {
      this.firebase = require( "firebase/app" );
      require( "firebase/auth" );
      require( "firebase/firestore" );
    } else {
      this.firebase = firebase;
    }
    // Initialize the Firebase SDK
    this.firebase.initializeApp( firebaseConfig );
    this.firestore = this.firebase.firestore();
    
    // handle logon callback
    this.firebase.auth().onAuthStateChanged(( user ) => {
      console.log("AUTHCHANGED");
      console.log(user);
      if( this.handler.auth_state_changed ) {
        this.user = user;
        this.handler.auth_state_changed( user );
        this.observe( this.observed.location, this.observed.radius )
      }
    });
    
    // Initialize GeoFireStore
    this.geofirestore = new GFS( this.firestore );
    
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
  _handleObject( doc, tag ) {
    if (!this.objects[doc.id]) {
      // retrieved a new (previously unknown) object
      this.objects[doc.id] = new AjnaObject(doc, this);
      if (this.handler.object_retrieved)
        this.handler.object_retrieved( this.objects[doc.id] );
    } else {
      // received an update for a known object
      this.objects[doc.id].doc = doc;
      if (this.handler.object_updated) {
        this.handler.object_updated( this.objects[doc.id] );
      }
    }
    if (tag && Array.isArray(this.objects[doc.id].tags)) this.objects[doc.id].tags.push( tag );
    
    console.log( doc.data().name + " updated!" );
  }
  
  GeoPoint( latitude, longitude ) {
    return new this.firebase.firestore.GeoPoint(latitude, longitude);
  }
  
  _snapshot_handler( querySnapshot, tag ) {
      querySnapshot.docChanges().forEach( change => {
        switch(change.type) {
          case "removed":
            this._remove_object(change.doc.id);
            break;
          default:
            this._handleObject( change.doc, tag );
        }
      });
  }
  
  _remove_object(id) {
    if (!this.objects[id]) {
      return;
    }
    console.log("object left: " + id);
    if ( this.handler['object_left'] !== false ) {
      this.handler['object_left']( this.objects[id] );
    }
    delete(this.objects[id]);
  }
  
  cleanup() {
    for(var i in this.objects) {
      if ( Array.isArray( this.objects[i].tags ) && ( this.objects[i].tags.length == 0 ) ) {
        this._remove_object(this.objects[i]);
      }
    }
  }
  
  observe( location, radius ) {
    this.observed.location = location;
    this.observed.radius = radius;
    
    if(!location)
      return false;
    
    this.geoquery = this.geocollection
      .near({ center: location, radius: radius/1000 });  // GeoFireStore works with km
    
    // untag all objects
    for (var i in this.objects) { this.objects[i].tags = [] };
      
    // RULE: !isPermissioned(resource.data.d)
    this.q1 = this.geoquery.where('p', '==', null);
    this.q1.onSnapshot((qS) => {this._snapshot_handler(qS, 1)}, (err) => { console.log( 'Encountered error: ', err ); });
    // RULE: hasAnonymousPerm(resource.data.d, 'r')
    this.q2 = this.geoquery.where('p.a', 'array-contains', 'r');
    this.q2.onSnapshot((qS) => {this._snapshot_handler(qS, 2)}, (err) => { console.log( 'Encountered error: ', err ); });

    // RULE: isOwner()
    if (this.user && this.user.uid) {
      this.q3 = this.geoquery.where('owner', '==', this.user.uid);
      this.q3.onSnapshot((qS) => {this._snapshot_handler(qS, 3)}, (err) => { console.log( 'Encountered error: ', err ); });
    }
    // RULE: hasPublicPerm(resource.data.d, 'read');
//    this.geoquery.where('permissions', '!=', null).where(onSnapshot(snapshot_handler.bind(this), err => { console.log( 'Encountered error: ', err ); });

    // check if a new heightmap tile needs to be loaded
    var loadRequired = true;
    if (loadRequired) {
      this.loadHeightmap( location );
    }
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
    var ajna = this;
    this.geocollection.doc( id ).update( data ).then((docRef) => {
      this.geocollection.doc( id ).get( ).then((docRef) => {
        // update local copy of the object
        ajna.objects[id].updateData( docRef );
      }, (error) => {
        console.log('Error: ', error);
      });
      
      if (onSuccess) onSuccess();
    }, (error) => {
      console.log('Error: ', error);
      if (onError) onError();
    });
  }
  
  // checks if the user has a specific permission on a given permissionSet
  checkPermission(permissionSet, perm, owner) {
    if(owner && this.user && owner===this.user.uid)
      return true;
    if (permissionSet) {
      // anonymous permissions
      if (permissionSet.a && permissionSet.a.includes(perm))
      { return true; }
      // registered-user permissions
      if (this.user && this.user.uid && permissionSet.r && permissionSet.r.includes(perm))
      { return true; }
      // user permissions
      if (this.user && permissionSet.u && permissionSet.u[this.user.uid] && permissionSet.u[this.user.uid].includes(perm))
      { return true; }
      console.log("no matching permission. access denied.");
      return false;
    }
    console.log("no permission to check - granting access.");
    return true;
  }
  
  
  getOffsetFromObserved(geoPoint) {
    var lon1 = this.observed.location._long;
    var lon2 = geoPoint._long;
    var lat1 = this.observed.location._lat;
    var lat2 = geoPoint._lat;
    var dx = this.turf.distance(turf.point([lon2, lat2]), turf.point([lon1, lat2]));
    var dy = this.turf.distance(turf.point([lon2, lat2]), turf.point([lon2, lat1]));
    return [dx * 1000, dy * 1000]; // return in meters
  }
  
  /** setHeightmap
   *
   * sets raw data for current heightmap
   */
  setHeightmap(heightMap) {
    this.heightMap = heightMap;
    if ( this.handler['heightmap_updated'] !== false ) {
      this.handler['heightmap_updated']( heightMap );
    }
  }
  
  /** loadHeightmap
   *
   * requests elevation data from mapbox and returns it as heightmap, which can be used by the client
   */
  loadHeightmap( location ) {
    console.log("retrieving heightmap for ", location._long, location._lat);
    // calc bounding box around current position
    var center = turf.point([location._long, location._lat]);
    var distance = this.observed.radius * 2; // heightmap is bigger than observation radius, since we want to move without reloading
    var nw = turf.transformTranslate(center, distance/1000, 315);
    var se = turf.transformTranslate(center, distance/1000, 135);
    var from_lat  = Math.min(nw.geometry.coordinates[1], se.geometry.coordinates[1]);
    var to_lat    = Math.max(nw.geometry.coordinates[1], se.geometry.coordinates[1]);
    var from_long = Math.min(nw.geometry.coordinates[0], se.geometry.coordinates[0]);
    var to_long   = Math.max(nw.geometry.coordinates[0], se.geometry.coordinates[0]);
    console.log("BB from " + from_lat + "/" + from_long + " to " + to_lat + "/" + to_long);
    var url = `https://api.elevationapi.com/api/Model/3d/bbox/${from_long},${to_long},${from_lat},${to_lat}`;
    if (DEBUG) url = "https://cors-anywhere.herokuapp.com/" + url;
    console.log(url);
    this.axios.get(url)
      .then(function success(res) {
        console.log(res);
        if (res.data.success) {
          // request heightmap
          var url_hm = `https://api.elevationapi.com${res.data.assetInfo.heightMap.filePath}`;
          if (DEBUG) url_hm = "https://cors-anywhere.herokuapp.com/" + url_hm;
          var hm_width = res.data.assetInfo.heightMap.width;
          var hm_height = res.data.assetInfo.heightMap.height;
          var attributions = res.data.assetInfo.attributions;
          console.log("now calling getPixels()");
          getPixels(url_hm, function(err, pixels) {
            if (err) {
              console.log("Bad image path", err);
              return;
            }
            console.log("got pixels", pixels);
            this.setHeightmap({
              url: url_hm,
              data: pixels.data,
              width: hm_width,
              height: hm_height,
              from_lat: from_lat,
              from_long: from_long,
              to_lat: to_lat,
              to_long: to_long,
              attributions: attributions
            });
            
            console.log("TESTING PROJECT/UNPROJECT");
            console.log(location);
            var p = this.hmProject(location);
            console.log(p);
            var l = this.hmUnproject(p[0], p[1]);
            console.log(l);
            var max = 0;
            var min = 255;
            for (var i in this.heightMap.data) {
              max = Math.max(max, this.heightMap.data[i]);
              min = Math.min(min, this.heightMap.data[i]);
            }
            console.log(`min color=${min}`);
            console.log(`max color=${max}`);
            console.log("TEST END");
            
            this.getGroundHeight( location );
            
          }.bind(this));
        }
      }.bind(this));
  }
  
  // world coordinates to x/y pixels on heightMap
  hmProject( location ) {
    if (location._lat < this.heightMap.from_lat || location._lat > this.heightMap.to_lat || location._long < this.heightMap.from_long || location._long > this.heightMap.to_long) {
      console.log("ERROR (hmProject): point outside heightmap");
      return;
    }
    var size_lat = this.heightMap.to_lat - this.heightMap.from_lat;
    var size_long = this.heightMap.to_long - this.heightMap.from_long;
    var d_lat = location._lat - this.heightMap.from_lat;
    var d_long = location._long - this.heightMap.from_long;
    var rx = d_long / size_long; // 0 .. 1
    var ry = d_lat / size_lat; // 0 .. 1
    var x = this.heightMap.width * rx;
    var y = this.heightMap.height * ry;
    return [x, y];
  }
  
  // x/y position on heightMap to world coordinates
  hmUnproject( x, y ) {
    if (x < 0 || x > this.heightMap.width || y < 0 || y > this.heightMap.height) {
      console.log("ERROR (hmUnproject): point outside heightmap");
      return;
    }
    var rx = x / this.heightMap.width;
    var ry = y / this.heightMap.height;
    var size_lat = this.heightMap.to_lat - this.heightMap.from_lat;
    var size_long = this.heightMap.to_long - this.heightMap.from_long;
    var lat = this.heightMap.from_lat + ry * size_lat;
    var lon = this.heightMap.from_long + rx * size_long;
    return this.GeoPoint(lat, lon);
  }
  
  getGroundHeight( location ) {
    var p = this.hmProject(location);
    var id = this.heightMap.width * Math.round(p[1]) + Math.round(p[0]);
    console.log(`getGroundHeight for ${location._long}/${location._lat}`);
    console.log(`projected position: ${p}`);
    console.log(`map width: ${this.heightMap.width}`);
    console.log(`id=${id}`);
    console.log(`pixel color=${this.heightMap.data[id]}`);
  }

}

class AjnaObject {
  
  constructor( doc, ajna ) {
    
    this.handler = {
      changed: false,
      action_triggered: false,
      message_received: false,
      move: false
    }
    
    this.ajna = ajna;
    this.id = doc.id || false;
    this.doc = doc || false;
    this.geocollection = ajna.geocollection;
    this.height_above_sealevel = undefined;
    
    //this.startObjectListener( );
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
  moveTo( location ) {
    var data = { coordinates: this.ajna.GeoPoint( location.lat, location.lon ) };
    this.ajna.setObject( 
      this.id,
      data,
      () => { console.log( "move successfull" ); },
      (err) => { console.log( "move unsuccessfull", err ); }
    );
  }
  
  /**
   * moves the object by a given value
   **/
  moveBy( d, bearing ) {
    var coordinates = this.doc.data().coordinates;
    var point = this.ajna.turf.point([coordinates._long, coordinates._lat]);
    var new_pos = this.ajna.transformTranslate( point, d/1000, bearing ); // translate by kilometers
    this.moveTo( {lat: new_pos.geometry.coordinates[1], lon: new_pos.geometry.coordinates[0]} );
  }
  
  moveForward( d ) {
    var my_bearing = (typeof this.doc.bearing == "undefined") ? 0 : this.doc.bearing;
    this.moveBy( d, my_bearing );
  }
  
  /**
   * sends a message to the objects inbox
   */
  send( type, message ) {
    var data = {
      type: type,
      parameters: ((typeof message)=="undefined") ? "undefined" : message
    };
    this.ajna.firestore.collection("objects").doc( this.id ).collection('inbox').add( data ).then(() => {
      console.log("message sent successfully");
    }, (error) => {
      console.log("error: ", error);
    });
  }
  
  set( data ) {
    this.geocollection.doc( this.id ).set( data, { merge: true } );
  }
  
  updateData( data ) {
    this.doc = data;
  }
  
  executeAction( name, params ) {
    this.send( name, params );
  }
  
  startMessageListener( ) {
    console.log("start listening for inbox items");
    // listen to inbox elements
    var that = this;
    this.ajna.firestore.collection( 'objects' ).doc( this.id ).collection( 'inbox' ).onSnapshot(
      function(querySnapshot) {
        querySnapshot.forEach( function(doc) {
          if (that.handler.message_received) {
            that.handler.message_received( doc.id, doc.data() )
          }
        });
      }, (err) => {
        console.log( 'Encountered error: ', err ); 
      }
    );
  }
  
  consumeMessage( id ) {
    this.ajna.firestore.collection( 'objects' ).doc( this.id ).collection( 'inbox' ).doc( id ).delete().then(
      function() {
        // message has been deleted
        console.log("message consumed");
      }
    );
  }
  
  stopMessageListener( ) {
    // TODO
  }

  
  getHeightAboveSealevel( ) {
    return this.height_above_sealevel;
  }
  
  getHeightAboveGround( ) {
    return this.doc.height;
  }
  
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
   module.exports = AjnaConnector;
else
   window.AjnaConnector = AjnaConnector;