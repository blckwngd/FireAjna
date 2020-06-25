// TODO: interpret pose for aframe

AFRAME.registerComponent('aruco-detector', {
  init: function () {
    // Code here.
    window.setTimeout(function() {
      this.video = document.querySelector("video");
      var canvasEl = document.querySelector("canvas");
      this.canvas = document.createElement("canvas");
      this.canvas.width = canvasEl.width;
      this.canvas.height = canvasEl.height;
      this.context = this.canvas.getContext("2d");
      this.detector = new AR.Detector();
      this.posit = new POS.Posit(100, this.canvas.width);
      this.initDone = true;
      this.el.emit('aruco-initialized');
    }.bind(this), 3000);
  },
  
  tick: function (time, timeDelta) {
    if (!this.initDone)
      return true;
    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA){
      this.snapshot();
      this.markers = this.detector.detect(this.imageData);
      if (this.markers.length > 0) {
        for (var m in this.markers) {
          var corners = this.markers[m].corners;
          for (var i = 0; i < corners.length; ++ i){
            corners[i].x = corners[i].x - (this.canvas.width / 2);
            corners[i].y = (this.canvas.height / 2) - corners[i].y;
          }
          this.markers[m].pose = this.posit.pose(corners);
          this.el.emit(`marker-${this.markers[m].id}-detected`, this.markers[m]);
        }
        this.el.emit('markers-detected', this.markers);
      }
    }
  },
  
  snapshot: function ( ) {
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

});
