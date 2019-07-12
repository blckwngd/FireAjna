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
