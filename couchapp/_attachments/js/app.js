// Kick off when the couchapp is ready
$.couch.app(function(app) {
  var map, 
      allMarkers = [], 
      markers = [],
      infoWindows = [],
      iconBlue = new google.maps.MarkerImage(),
      iconBlueShadow = 'http://labs.google.com/ridefinder/images/mm_20_shadow.png',
      start_latlng = new google.maps.LatLng(37.77493, -122.41942);
  
  iconBlue.url = 'http://labs.google.com/ridefinder/images/mm_20_blue.png';
  iconBlue.size = new google.maps.Size(12, 20);
  iconBlue.anchor = new google.maps.Point(6, 20);
  iconBlue.origin = new google.maps.Point(0, 0);


  var myOptions = {
      zoom: 13,
      center: start_latlng,
      mapTypeId: google.maps.MapTypeId.ROADMAP
  };

  map = new google.maps.Map(document.getElementById("muralmap"), myOptions);
  updateMarkers();

  // Demo click handler
  $('#demo').click(function(ev) {
    ev.preventDefault();
    clearMarkers();
    updateMarkers(true);
  });

  function updateMarkers(demo) {
    demo = demo || false;
    $.getJSON('_list/geojson/locations', function(data) {
      var items = [];
      var indx = 0;

      $.each(data.features, function(key, val) {
        var name, text, imagepath, thumbnail, point, marker;
        if(allMarkers.indexOf(val.properties.id) === -1) {
          indx++;
          name = val.properties.name;
          text = val.properties.text;
          imagepath = val.properties.tweet_image;
          thumbnail = val.properties.thumbnail;
          point = new google.maps.LatLng(parseFloat(val.geometry.coordinates[1]), parseFloat(val.geometry.coordinates[0]));
          marker = createMarker(point, name, imagepath, text, thumbnail);

          allMarkers.push(val.properties.id);
          var delta = (demo) ? 500 : 50;

          setTimeout(function() {
              if(demo) { map.panTo(point); }
              markers.push(marker);
              marker.setMap(map);
          }, delta * indx);

        }
      });
    });
  }

  function createMarker(point, name, image, text, thumbnail) {
    var html = "<div class=\"bubble_details\">"+
                "<div class=\"bubble_img_container\" >"+
                  "<img class=\"bubble_img\" src=\""+image+ "\"/>"+
                "</div>"+
                "<div class=\"bubble_profile\">"+
                  "<a href=http://twitter.com/"+ name + " target=\"_blank\"><img id=\"thumb\" src=\"" + thumbnail + "\"/></a>"+
                  "<span>@" + name + "</span>"+
                "</div>";
    html += "<div class=\"bubble_text\">"+text.parseURL().parseUsername().parseHashtag()+"</div></div>";

    var markerOptions = {
      position: point,
      draggable: false,
      icon: iconBlue,
      shadow: iconBlueShadow,
      animation: google.maps.Animation.DROP
    };
    var infowindow = new google.maps.InfoWindow({
      content: html
    });
    var marker = new google.maps.Marker(markerOptions);

    infoWindows.push(infowindow);
    
    google.maps.event.addListener(marker, 'click', function() {
      $.each(infoWindows, function(idx, el) { el.close(); });
      infowindow.open(map,marker);
    });

    return marker;
  }

  function clearMarkers() {
    allMarkers = [];
    if (markers) {
      for (i in markers) {
        markers[i].setMap(null);
        delete markers[i];
      }
    }
  }
}, { design: 'muralmapper' });

// Extra helper functions that we'll just hang off of the String object
String.prototype.parseURL = function() {
  return this.replace(/[A-Za-z]+:\/\/[A-Za-z0-9-_]+\.[A-Za-z0-9-_:%&~\?\/.=]+/g, function(url) {
    return url.link(url);
  });
};

String.prototype.parseUsername = function() {
  return this.replace(/[@]+[A-Za-z0-9-_]+/g, function(u) {
    var username = u.replace("@","")
    return u.link("http://twitter.com/"+username);
  });
};

String.prototype.parseHashtag = function() {
  return this.replace(/[#]+[A-Za-z0-9-_]+/g, function(t) {
    var tag = t.replace("#","%23")
    return t.link("http://search.twitter.com/search?q="+tag);
  });
};