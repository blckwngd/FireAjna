// TODO: interpret pose for aframe
// TODO: bake into an aframe component

var video, canvas, context, imageData, detector, posit, markerDetectedCallback, markersDetectedCallback;

function initMarkerDetection(canvasEl, videoEl){
  video = videoEl;
  canvas = document.createElement("canvas");
  canvas.width = canvasEl.width;
  canvas.height = canvasEl.height;
  
  context = canvas.getContext("2d");
  
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }
  
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
      
      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
      }

      return new Promise(function(resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    }
  }
  
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(function(stream) {
      if ("srcObject" in video) {
        video.srcObject = stream;
      } else {
        video.src = window.URL.createObjectURL(stream);
      }
    })
    .catch(function(err) {
      console.log(err.name + ": " + err.message);
    }
  );
    
  detector = new AR.Detector();
  posit = new POS.Posit(0.1, canvas.width);
  
  requestAnimationFrame(tick);
}

function tick(){
  requestAnimationFrame(tick);
  
  if (video.readyState === video.HAVE_ENOUGH_DATA){
    snapshot();
    var markers = detector.detect(imageData);
    if (markersDetectedCallback && (markers.length > 0)) {
      markersDetectedCallback(markers);
    }
    if (markerDetectedCallback && (markers.length > 0)) {
      for (var m in markers) {
        var corners = markers[m].corners;
        for (var i = 0; i < corners.length; ++ i){
          corners[i].x = corners[i].x - (canvas.width / 2);
          corners[i].y = (canvas.height / 2) - corners[i].y;
        }
        var pose = posit.pose(corners);
        markerDetectedCallback(markers[m], pose);
      }
    }
  }
}

function snapshot(){
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  imageData = context.getImageData(0, 0, canvas.width, canvas.height);
}
