'use strict';

var url = require("url");
var request = require('request');

var Venue = require('../models/venues.js');
var Location = require('../models/location.js');

function BarSquare() {

  var foursquare_client_id = process.env.FOURSQUARE_CLIENT_ID;
  var foursquare_client_secret = process.env.FOURSQUARE_CLIENT_SECRET;
  var foursquare_path = 'https://api.foursquare.com/v2/venues/';
  var foursquare_version = '20160605';
  var foursquare_size_photo = '350x200';
  var foursquare_limit = 40;
  var self = this;

  var getRandom = function(max) {
    return Math.floor(Math.random() * max);
  }

  var getInfo = function(bars, i, callback) {
    var api_url  = foursquare_path + bars[i]._id;
        api_url += '?v=' + foursquare_version;
        api_url += '&client_id=' + foursquare_client_id;
        api_url += '&client_secret=' + foursquare_client_secret;
    request(api_url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var data = JSON.parse(body).response.venue;
        bars[i].url = data.shortUrl;
        if(data.tips.count) {
          var tip = data.tips.groups[0].items[getRandom(data.tips.groups[0].items.length)];
          bars[i].tip.text = tip.text;
          bars[i].tip.author = tip.user.firstName + ' ' + (tip.user.lastName || '');
        }
        if(data.photos.count) {
          var photo = data.photos.groups[0].items[getRandom(data.photos.groups[0].items.length)];
          bars[i].photo = photo.prefix + foursquare_size_photo + photo.suffix;
        }
        // Save Venue on database
        var venue = bars[i];
        var options = { upsert: true, new: true, setDefaultsOnInsert: true };
    		Venue.findOneAndUpdate({ '_id': venue._id }, venue, options, function(err, result) {
    			if (err) throw err;
          bars[i] = result;
          i++;
          if (i < bars.length) {
            getInfo(bars, i, callback);
          } else {
            callback(bars);
          }
        });
        // Continue
      } else {
        console.log(error);
        callback([]);
      };
    });
  }

  this.getSearch = function(req, res) {
    var query = url.parse(req.url, true).query
    var offset = parseInt(query.offset || "0");
    var location = req.params.location;
    var category = '4bf58dd8d48988d116941735';
    var bars = [];
    var api_url  = foursquare_path + 'search';
        api_url += '?near=' + location;
        api_url += '&categoryId=' + category;
        api_url += '&limit=' + foursquare_limit;
        api_url += '&v=' + foursquare_version;
        api_url += '&client_id=' + foursquare_client_id;
        api_url += '&client_secret=' + foursquare_client_secret;
    // Check Limit and offset
    if (offset >= foursquare_limit) {
      res.json(bars);
      return;
    }
    // Save search
    self.saveSearch(location);
    // Call API Foursquare
    request(api_url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var data = JSON.parse(body).response.venues;
        for (var i in data) {
          bars.push({ "_id": data[i].id,
                       "name": data[i].name,
                       "address": data[i].location.address,
                       "checkins": data[i].stats.checkinsCount,
                       "tip": { "text": "No tips found", "author": "" },
                       "photo": "/public/img/photo_default.jpg"
          });
        };
        bars = bars.filter(function(value, index) {
          return ((index >= offset) && (index < (offset + 4)));
        });
        if (bars.length) {
          getInfo(bars, 0, function(bars){
            res.json(bars);
          });
        } else {
          res.json(bars);
        }
      } else {
        res.json({'error': true, 'message': "Couldn't geocode param near: " + location})
      };
    });
  };

  this.checkIn = function(req, res) {
    var venue_id = req.body.venue_id;
    var date = new Date();
    var user_id = req.user._id;
    // Check if user check before
    function userIn(visit) {
      var pos = -1;
      var today = date.getDate() + '.' + date.getMonth() + '.' + date.getFullYear();
      for(var i in visit) {
        var visit_date = visit[i].date.getDate() + '.' + visit[i].date.getMonth() + '.' + visit[i].date.getFullYear();
        if (visit_date === today && visit[i].user_id === user_id) {
          pos = i;
          break;
        }
      }
      return pos;
    };
    // Find and save checkin information
    Venue.findOne({ '_id': venue_id }, function(err, venue) {
      if (err) throw err;
      if (venue) {
        var pos = userIn(venue.visits)
        if (pos < 0) {
          venue.visits.push({date: date, user_id: user_id});
        } else {
          venue.visits.splice(pos, 1);
        }
        venue.save();
        res.json({'count': venue.visits.length});
      } else {
        res.json({'error': true, 'message': "Venue not found"});
      }
    });
  };

  this.saveSearch = function(where) {
    var last = { 'name': where, 'when': new Date() };
    var options = { upsert: true, new: true, setDefaultsOnInsert: true };
		Location.findOneAndUpdate({ 'name': where }, last, options, function(err, result) {
			if (err) { return false; }
    });
  };

  this.getLatest = function(req, res) {
    Location
      .find({}, { __v: false })
      .sort({'when': -1})
      .limit(5)
      .exec(function(err, latest) {
        res.json(latest);
      });
  };

};

module.exports = BarSquare;
