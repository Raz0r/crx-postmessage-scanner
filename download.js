var fs = require('fs');
var request = require('request');
var async = require('async');

var extensionsList = JSON.parse(fs.readFileSync('extensions/list.json'));
console.log("Got " + extensionsList.length.toString() + " extensions");

async.eachOfLimit(extensionsList, 50, function(extension, key, callback){
  console.log(key);
  var stream = fs.createWriteStream('extensions/' + extension.id + '.crx')
  stream.on('close', function() {
    if(fs.existsSync('extensions/' + extension.id + '.crx')) {
      var stats = fs.statSync('extensions/' + extension.id + '.crx');
      if (stats.size === 0) {
        console.log("zero size: " + extension.id);
        fs.unlink('extensions/' + extension.id + '.crx');
        callback();
      } else {
        fs.writeFileSync('extensions/' + extension.id + '.json',
          JSON.stringify(extension), {flag: 'w'})
        console.log('[~] ' + extension.id);
        callback();
      }
    } else {
      console.log('[~] does no exist! ' + extension.id);
      callback();
    }
  });
  request({
    url: 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=49.0&x=id%3D***%26installsource%3Dondemand%26uc'.replace('***', extension.id),
    method: 'GET',
    encoding: null
  }).pipe(stream)
}, function(err){
  console.error(err)
})
