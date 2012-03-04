/**
 * Node.js script to poll Twitter API and store mentions in a CouchDB instance.
 */

// Include required modules
var sys = require('util');
var http = require('http');
var twitter = require('twitter');
var cradle = require('cradle');
var config = require('./config');

console.log(config);
// Last ditch hander for an exception.
process.on('uncaughtException', function (err) {
  sys.puts('An unhandled exception occurred: ' + err);
});

// Create new Twitter object
var twit = new twitter({
  consumer_key : config.twitter.consumer_key,
  consumer_secret : config.twitter.consumer_secret,
  access_token_key : config.twitter.access_token_key,
  access_token_secret : config.twitter.access_token_secret
});

// Create new connection to CouchDB instance.
var db = new (cradle.Connection)(config.couchdb.host, config.couchdb.port, {
  auth : {
    username : config.couchdb.userid,
    password : config.couchdb.password
  }
}).database(config.couchdb.dbname);

// Create new connection to the public_art CouchDB instance.
var db2 = new (cradle.Connection)(config.couchdb2.host, config.couchdb2.port, {
  auth : {
    username : config.couchdb2.userid,
    password : config.couchdb2.password
  }
}).database(config.couchdb2.dbname);

// From http://www.simonwhatley.co.uk/examples/twitter/prototype/
String.prototype.pull_url = function() {
  if(this.indexOf('yfrog') != -1) {
    return  'http://'+this.match(/yfrog.com\/[A-Za-z0-9-_]+/g, function(url) {
      return url;
    });
  } else {
    return this.match(/[A-Za-z]+:\/\/[A-Za-z0-9-_]+\.[A-Za-z0-9-_:%&~\?\/.=]+/g, function(url) {
      return url;
    });
  }
};

// Function to decode flic.kr urls
// Based on http://www.flickr.com/groups/api/discuss/72157616713786392/
function base58_decode(num) {
  var alpha = '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  var decoded = 0;
  var multi = 1;
  var digit;

  while(num.length > 0) {
    digit =num[num.length - 1];
    decoded += multi * alpha.indexOf(digit);
    multi = multi * alpha.length;
    num = num.slice(0, -1);
  }

  return decoded;
}

function transform_tweet(tweet) {
  // {
  //   "_id" : "public_art_finder_template",
  //   "title" : "[string] - title of the piece of art",
  //   "artist" : "[string] - name of the artist(s), we'll need a way of normalizing this",
  //   "description" : "[string] - description of work, artist statement, notes, etc.",
  //   "discipline" : "[string] - preferably one of the following: sculpture, painting, photography, ceramics, fiber, architectural integration, mural, fountain, other",
  //   "location_description" : "[string] - human readable location ",
  //   "full_address" : "[string] - full street address, w/ city, state, zip if possible",
  //   "geometry" : "[object] - latitude/longitude in geojson point format",
  //   "image_urls" : "[string] - This will be a comma delimited list of urls to remote images.  The other option for images is to make them attachments to the document.  I think we should accept both.",
  //   "data_source" : "[string] - the source of the data. (i.e. 'San Francisco Arts Commission')",
  //   "doc_type" : "[string] - this field is used by the app and should always be set to 'artwork'"
  // }
  var t = {}, 
      handle_regex = /^\@PublicArtApp/g, 
      link_regex = /http\:\/\/.*$/g;
  
  t._id = ''+tweet.id;
  t.title = '';
  t.artist = '';

  t.description = tweet.text;
  t.description = t.description.replace(handle_regex, '');
  t.description = t.description.replace(link_regex, '');
  
  t.discipline = '';
  t.location_description = (tweet.place.full_name) ? tweet.place.full_name : '';
  t.full_address = t.location_description;
  t.geometry = tweet.geo;
  t.image_urls = [tweet.tweet_image];
  t.data_source = 'Twitter';
  t.doc_type = 'artwork';
  t.twitterer = tweet.user.screen_name;
  
  return t;
}

// At a set interval, fetch all mentions
setInterval(function() {

  // At the begining of each poll, get the ID of the last doc inserted.
  db.view('muralmapper/tweetid',{descending: true, limit: 1}, function(err, res) {
    if(err) {
      sys.puts('Could not fetch last document ID. Unable to poll Twitter API. ' + err.reason);
    } else {

      // Use the last document ID to refine twitter API call (if no docs exist, just use an arbitrary low number).
      var since_id = res.length == 0 ? 10000 : res[0].id;

      console.warn("Document ID of last downloaded tweet: "+since_id);
      twit.get('/statuses/mentions.json?include_entities=true&since_id=' + since_id, function(data) {

        if(data.statusCode == 400) console.warn(data.data.error);
        var i = 0, translated_obj;
        console.warn("Found "+data.length+" tweets.");
        // Iterate over returned mentions and store in CouchDB.
        for (; i < data.length; i+=1) {

          // Check if tweet fetched matches since_id (Twitter API bug?)
          if(data[i].id == since_id) {
            continue;
          }

          var cur_url = '';
          var internal_id;
          
          if(data[i].geo) {
            // If there is a media_url, use it; otherwise start guessing
            // which 3rd party service they are using.
            if(data[i].entities && data[i].entities.media) {
                data[i].tweet_image = data[i].entities.media[0].media_url;
            } else {
              // If the image url has been shortened by twitter, we need to get the
              // expanded url.
              var img_urls = (data[i].entities && data[i].entities.urls && data[i].entities.urls[0].expanded_url) ? data[i].entities.urls[0].expanded_url : data[i].text.pull_url();

              console.warn(img_urls);
              data[i].tweet_image = '';
              if(img_urls.length > 0) {
                cur_url = (typeof(img_urls) == 'string') ? img_urls : img_urls[0];
                if(cur_url.toLowerCase().indexOf('twitpic') != -1) {
                  console.warn('Photo from twitpic.');
                  internal_id = cur_url.split('/').pop();
                  data[i].tweet_image = 'http://twitpic.com/show/full/'+internal_id;
                } else if(cur_url.toLowerCase().indexOf('yfrog') != -1) {
                  console.warn('Photo from yfrog');  
                  data[i].tweet_image = cur_url+':iphone';
                } else if(cur_url.toLowerCase().indexOf('lockerz') != -1) {
                  console.warn('Photo from lockerz');
                  data[i].tweet_image = 'http://api.plixi.com/api/tpapi.svc/imagefromurl?url='+cur_url+'&size=mobile';
                } else if(cur_url.toLowerCase().indexOf('flic.kr') != -1) {
                  console.warn('Photo from flickr');
                  data[i].tweet_image = '';
                }
              }
            }
          }
          console.warn(data[i]);
          db.save('' + data[i].id, data[i], function(err, res) {
            if (err) {
              sys.puts('Could not save document with id ' + data[i].id + '. ' + err.reason);
            } else {
              sys.puts('Saved document with id ' + res.id + '. Rev ID: ' + res.rev);
            }
          });
          
          transformed_tweet = transform_tweet(data[i]);
          console.warn('====== Transformed tweet ======');
          console.warn(transformed_tweet);
          console.warn('===============================');
          db2.save('' + transformed_tweet._id + '', transformed_tweet, function(err, res) {
            if (err) {
              sys.puts('Could not save document in the tweet db with id ' + data[i].id + '. ' + err.reason);
            } else {
              sys.puts('Saved document in the tweet db with id ' + res.id + '. Rev ID: ' + res.rev);
            }
          });
        }
      });
    }
  });
}, config.timers.interval);
