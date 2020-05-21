// browserify ajna-connector.js --s AjnaConnector -d -o AjnaConnector.js

const GFS = require( "geofirestore" ).GeoFirestore;
const turf = require('@turf/turf');
const transformTranslate = require("@turf/transform-translate");
const axios = require("axios");
const getPixels = require( "get-pixels" );

class AjnaConnector {

  constructor( firebaseConfig ) {
    
    this.handler = {
      object_retrieved: false,
      auth_state_changed: false,
      object_entered: false,
      object_updated: false,
      object_left: false,
      heightmap_updated: false,
      message_received: false
    }
    
    this.objects = [];
    this.user = false;
    this.observed = {
      location: null,
      radius: null
    };
    this.heightMap = false;
    // DEFAULT = load elevation data from elevationapi.net
    // COMPATIBLE = use cors proxy for requests
    // NONE = don´t use elevation data
    this.heightMapMode = "NONE"; 
    this.lastTick = Date.now();
    
    // Initialize the Firebase SDK
    firebase.initializeApp( firebaseConfig );
    this.firestore = firebase.firestore();
    
    // handle logon callback
    firebase.auth().onAuthStateChanged(( user ) => {
      if( this.handler.auth_state_changed ) {
        this.user = user;
        this.handler.auth_state_changed( user );
        if (this.observed.location) {
          this.observe( this.observed.location, this.observed.radius );
        }
      }
    });
    
    // Initialize GeoFireStore
    this.geofirestore = new GFS( this.firestore );
    
    // GeoCollection reference
    this.geocollection = this.geofirestore.collection( 'objects' );
  }
  
  login( username, password, callback ) {
    firebase.auth().signInWithEmailAndPassword(username, password).catch(function(error) {
      callback(error);
    });
  }
  
  logout( ) {
    firebase.auth().signOut();
  }
  
  firebase( ) {
    return firebase;
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
      this.objects[doc.id].updateData(doc);
      if (this.handler.object_updated) {
        this.handler.object_updated( this.objects[doc.id] );
      }
    }
    if (tag && Array.isArray(this.objects[doc.id].tags)) this.objects[doc.id].tags.push( tag );
    
    //console.log( doc.data().name + " updated!" );
  }
  
  GeoPoint( latitude, longitude ) {
    return new firebase.firestore.GeoPoint(latitude, longitude);
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
  
  tick() {
    var ts = Date.now();
    var delta = ts - this.lastTick;
    this.lastTick = ts;
    
    for(var i in this.objects) {
      this.objects[i].tick(delta);
    }
  }
  
  cleanup() {
    for(var i in this.objects) {
      if ( Array.isArray( this.objects[i].tags ) && ( this.objects[i].tags.length == 0 ) ) {
        this._remove_object(this.objects[i]);
      }
    }
  }
  
  observe( location, radius ) {
    
    console.log("now observing", location);
    
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
    var loadRequired = false;
    if (this.heightMap === false) {
      loadRequired = true;
    } else {
      var dst = 1000 * turf.distance(turf.point([location._long, location._lat]), turf.point([this.heightMap.center_long, this.heightMap.center_lat]));
      loadRequired = (dst >= this.observed.radius);
    }
    if ((this.heightMapMode != "NONE") && loadRequired) {
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
    this.geocollection.doc( id ).update( data ).then(function(docRef) {
      this.geocollection.doc( id ).get( ).then(function(docRef) {
        // update local copy of the object
        this.objects[id].updateData( docRef );
      }.bind(this), (error) => {
        console.log('Error: ', error);
      });
      
      if (onSuccess) onSuccess();
    }.bind(this), (error) => {
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
    var dx = turf.distance(turf.point([lon2, lat2]), turf.point([lon1, lat2]));
    var dy = turf.distance(turf.point([lon2, lat2]), turf.point([lon2, lat1]));
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
    if (this.heightMapMode == "NONE")
      return;
    // calc bounding box around current position
    var center = turf.point([location._long, location._lat]);
    var distance = this.observed.radius * 2; // heightmap is bigger than observation radius, since we want to move without reloading
    var nw = turf.transformTranslate(center, distance/1000, 315);
    var se = turf.transformTranslate(center, distance/1000, 135);
    var from_lat  = Math.min(nw.geometry.coordinates[1], se.geometry.coordinates[1]);
    var to_lat    = Math.max(nw.geometry.coordinates[1], se.geometry.coordinates[1]);
    var from_long = Math.min(nw.geometry.coordinates[0], se.geometry.coordinates[0]);
    var to_long   = Math.max(nw.geometry.coordinates[0], se.geometry.coordinates[0]);
    var url = `https://api.elevationapi.com/api/Model/3d/bbox/${from_long},${to_long},${from_lat},${to_lat}`;
    if (this.heightMapMode == "DEBUG") url = "https://cors-anywhere.herokuapp.com/" + url;
    axios.get(url)
      .then(function success(res) {
        if (res.data.success) {
          // request heightmap
          var url_hm = `https://api.elevationapi.com${res.data.assetInfo.heightMap.filePath}`;
          if (this.heightMapMode == "DEBUG") url_hm = "https://cors-anywhere.herokuapp.com/" + url_hm;
          var hm_width = res.data.assetInfo.heightMap.width;
          var hm_height = res.data.assetInfo.heightMap.height;
          var hm_minElevation = res.data.assetInfo.minElevation;
          var hm_maxElevation = res.data.assetInfo.maxElevation;
          var attributions = res.data.assetInfo.attributions;
          getPixels(url_hm, function(err, pixels) {
            if (err) {
              console.log("Bad image path", err);
              return;
            }
            
            // detect height difference per pixel value
            var max = Math.max.apply(null, pixels.data); // should be 255
            var min = Math.min.apply(null, pixels.data); // should be 0
            var heightStep = (hm_minElevation == hm_maxElevation) ? 0 : ((hm_maxElevation - hm_minElevation) / (max - min));
            
            this.setHeightmap({
              url: url_hm,
              data: pixels.data,
              width: hm_width,
              height: hm_height,
              minElevation: hm_minElevation,
              maxElevation: hm_maxElevation,
              heightStep: heightStep,
              from_lat: from_lat,
              from_long: from_long,
              to_lat: to_lat,
              to_long: to_long,
              center_lat: location._lat,
              center_long: location._long,
              attributions: attributions
            });
            
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
    var ele = this.heightMap.minElevation + this.heightMap.data[id] * this.heightMap.heightStep;
    console.log(`getGroundHeight for ${location._long}/${location._lat}`);
    console.log(`projected position: ${p}`);
    console.log(`map width: ${this.heightMap.width}`);
    console.log(`id=${id}`);
    console.log(`pixel color=${this.heightMap.data[id]}`);
    console.log(`elevation=${ele}`);
    return ele;
  }
  
  
  /**
   * Listens for messages which were sent to the user.
   * If requested by 'drainQueue', all existing messages will be deleted from the inbox before starting the listener.
   */
  startMessageListener( msgType, drainQueue ) {
    
    msgType = (typeof msgType == "undefined") ? "message" : msgType;
    drainQueue = (typeof drainQueue == "undefined") ? true : drainQueue;
    
    // drain the message queue if requested
    var busy = false;
    var numDeleted = 0;
    if (drainQueue) {
      busy = true;
      console.log("user: " + this.user.uid);
      // get all documents in the users inbox, which were sent to the current object (this)
      this.firestore.collection('users').doc( this.user.uid ).collection( 'inbox' ).where('type', '==', msgType).get()
      .then(function(querySnapshot) {
            console.log("got message queue. draining it if necessary.");
            var batch = this.firestore.batch();
            querySnapshot.forEach(function(doc) { numDeleted++; batch.delete(doc.ref); });
            batch.commit().catch(function(e) { console.log(e); });
      }.bind(this)).then(function() {
          if (numDeleted > 0)
            console.log(`drained ${numDeleted} messages from the queue`);
          busy = false;
      });
    }
    // listen to the users inbox for messages
    this.firestore.collection( 'users' ).doc( this.user.uid ).collection( 'inbox' ).where('type', '==', msgType).onSnapshot(
      function(querySnapshot) {
        querySnapshot.forEach( function(doc) {
          // only call handler when it exists, an when the delete batch is finished
          if (!busy && this.handler.message_received) {
            this.handler.message_received( doc.id, doc.data() )
          }
        }.bind(this));
      }.bind(this), (err) => {
        console.log( 'Encountered error: ', err ); 
      }
    );
  }
  
  sendMessage( recipient, type, message, sendingObject, receivingObject ) {
    if (typeof message == "undefined") message = "undefined";
    var data = {
      type: type,
      parameters: message,
      sender: this.user.uid
    };
    if (typeof sendingObject != "undefined") data.sendingObject = sendingObject;
    if (typeof receivingObject != "undefined") data.receivingObject = receivingObject;
    
    this.firestore.collection("users").doc( recipient ).collection('inbox').add( data ).then(() => {
      console.log("message sent successfully");
    }, (error) => {
      console.log("error: ", error);
    });
  }
  
  
  consumeMessage( id ) {
    this.firestore.collection( 'users' ).doc( this.user.uid ).collection( 'inbox' ).doc( id ).delete().then(
      function() {
        // message has been deleted
        console.log("message consumed");
      }
    );
  }

}

class AjnaObject {
  
  constructor( doc, ajna ) {
    
    this.handler = {
      changed: false,
      action_triggered: false,
      message_received: false,
      move: false,
      before_tick: false,
      after_tick: false
    }
    
    this.ajna = ajna;
    this.id = doc.id || false;
    this.doc = doc || false;
    this.geocollection = ajna.geocollection;
    this.height_above_sealevel = undefined;
    this.localCoordinates = false;
    
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
  
  
  partialUpdate( data ) {
    this.ajna.setObject( 
      this.id,
      data,
      () => { /* SUCCESS */ },
      (err) => { console.log( "object update unsuccessfull", err ); }
    );
  }
  
  /**
   * moves the object to a specific location, given by latitude and longitude
   **/
  moveTo( location ) {
    this.localCoordinates = this.ajna.GeoPoint( location.lat, location.lon );
  }
  
  
  /**
   * moves the object by a given value
   **/
  moveBy( d, bearing ) {
    var coordinates = this.getLocalCoordinates();
    var point = turf.point([coordinates._long, coordinates._lat]);
    var new_pos = transformTranslate( point, d/1000, bearing ); // translate by kilometers
    this.moveTo( {lat: new_pos.geometry.coordinates[1], lon: new_pos.geometry.coordinates[0]} );
  }
  
  moveForward( d ) {
    var my_bearing = (typeof this.doc.data().bearing == "undefined") ? 0 : this.doc.data().bearing;
    //console.log(`moving ${d}m with bearing ${my_bearing}`);
    this.moveBy( d, my_bearing );
  }
  
  startMoving( velocity, bearing ) {
    var my_bearing = (typeof bearing != "undefined") ? bearing : (this.doc.data().bearing || 0);
    if (typeof velocity != "number" || velocity < 0) {
      throw "INVALID SPEED";
      return;
    }
    console.log("startMoving: v=" + velocity);
    this.partialUpdate({
      "coordinates": this.getLocalCoordinates(),
      "bearing": my_bearing,
      "velocity": velocity
    });
  }
  
  getLocalCoordinates() {
    return this.localCoordinates || this.doc.data().coordinates;
  }
  
  startMovingTowards( velocity, target ) {
    var coordinates = this.getLocalCoordinates();
    var pointMe = turf.point([coordinates._long, coordinates._lat]);
    var pointTarget = turf.point([target._long, target._lat]);
    var bearing = turf.bearing(pointMe, pointTarget);
    this.startMoving(velocity, bearing);
  }
  
  stopMoving( ) {
    this.partialUpdate({
      "coordinates": this.getLocalCoordinates(),
      "velocity": 0
    });
  }
  
  getDistanceTo( target ) {
    var p = this.getLocalCoordinates();
    var p1 = turf.point([p._long, p._lat]);
    var p2 = turf.point([target._long, target._lat]);
    return turf.distance(p1, p2) * 1000;
  }
  
  pushLocalChanges() {
    this.partialUpdate({ 
      coordinates: this.getLocalCoordinates()
    });
  }
  
  /** 
    update object at each frame; changes will be local by default.
    used i.e. to interpolate obejcts positions when moving.
  */
  tick( delta ) {
    if (this.handler.before_tick)
      this.handler.before_tick(delta);
    
    var data = this.doc.data();
    if ((typeof data.velocity != "undefined") && (data.velocity > 0)) {
      //console.log(`tick: velocity=${data.velocity} m/s`);
      var dst = data.velocity * (delta / 1000);
      this.moveForward( dst );
      
      if (this.ajna.handler.object_updated)
        this.ajna.handler.object_updated(this);
    }
    if (this.handler.after_tick)
      this.handler.after_tick(delta);
  }
  
  /**
   * sends a message to the objects inbox
   */
  send( type, message ) {
    var data = {
      type: type,
      parameters: ((typeof message)=="undefined") ? "undefined" : message,
      sender: this.ajna.user.uid,
      receivingObject: this.id
    };
    // message is sent to the objects agent. if it doesn´t exist, send to its owner.
    var recipient = this.doc.data().agent || this.doc.data().owner;
    
    this.ajna.firestore.collection("users").doc( recipient ).collection('inbox').add( data ).then(() => {
      console.log("message sent successfully");
    }, (error) => {
      console.log("error: ", error);
    });
  }
  
  set( data ) {
    this.geocollection.doc( this.id ).set( data, { merge: true } );
  }
  
  setAnimation( name ) {
    if ( typeof this.doc.data().model == "undefined" ) {
      console.log("no model to animate");
      return false;
    }
    this.ajna.setObject (
      this.id,
      { "model.animation": name},
      // onSuccess
      () => { },
      // onError
      (err) => { console.log("animation error :-(", err); },
    );
  }
  
  updateData( doc ) {
    this.localCoordinates = doc.data().coordinates;
    this.doc = doc;
  }
  
  delete( callback ) {
    this.ajna.firestore.collection( 'objects' ).doc( this.id ).delete()
    .catch(
      function( ) {
        if (typeof callback != "undefined")
          callback (false);
      }
    )
    .then(
      function( ) {
        if (typeof callback != "undefined")
          callback (true);
      }
    )
  }
  
  executeAction( name, params ) {
    this.send( name, params );
  }
  
  /**
   * Listens for messages which were sent to this object.
   * Requires that the current user is either the owner, or the agent for the object.
   * If requested by 'drainQueue', all existing messages will be deleted from the inbox before starting the listener.
   */
  startMessageListener( drainQueue ) {
    drainQueue = (typeof drainQueue == "undefined") ? true : drainQueue;
    
    // drain the message queue if requested
    var busy = false;
    var numDeleted = 0;
    if (drainQueue) {
      busy = true;
      // get all documents in the users inbox, which were sent to the current object (this)
      this.ajna.firestore.collection('users').doc( this.ajna.user.uid ).collection( 'inbox' ).where('receivingObject', '==', this.id).get()
      .then(function(querySnapshot) {
            console.log("got message queue. draining it if necessary.");
            var batch = this.ajna.firestore.batch();
            querySnapshot.forEach(function(doc) { numDeleted++; batch.delete(doc.ref); });
            batch.commit().catch(function(e) { console.log(e); });
      }.bind(this)).then(function() {
          if (numDeleted > 0)
            console.log(`drained ${numDeleted} messages from the queue`);
          busy = false;
      });
    }
    
    // listen to the users inbox for messages, which were sent to the current object (this)
    this.ajna.firestore.collection( 'users' ).doc( this.ajna.user.uid ).collection( 'inbox' ).where('receivingObject', '==', this.id).onSnapshot(
      function(querySnapshot) {
        querySnapshot.forEach( function(doc) {
          // only call handler when it exists, an when the delete batch is finished
          if (!busy && this.handler.message_received) {
            this.handler.message_received( doc.id, doc.data() )
          }
        }.bind(this));
      }.bind(this), (err) => {
        console.log( 'Encountered error: ', err ); 
      }
    );
  }
  
  consumeMessage( id ) {
    this.ajna.consumeMessage(id);
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

module.exports = AjnaConnector;