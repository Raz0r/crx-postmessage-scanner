var request = require('request');
var fs = require('fs');
var async = require('async');

var extensionsList = [];
var indices = [];

for(var i=0; i<10000; i+=100) {
  indices.push(i);
}

async.eachLimit(indices, 50, function(i, callback){
  request.post('https://chrome.google.com/webstore/ajax/item', {
    form: {
      pv: 20170206,
      mce: "atf,eed,pii,rtr,rlb,gtc,hcn,svp,wtd,c3d,ncr,ctm,ac,hot,euf,mac,fcf,rma,rae,shr,esl,igb",
      count: 100,
      category: 'ext/11-web-development', // extensions category
      token: i.toString() + '@' + i.toString()
    }
  },
  function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var extensions = JSON.parse(body.slice(6));

      extensions[1][1].some(function(ext){
        var extension = {};
        extension["id"] = ext[0];
        extension["name"] = ext[1];
        extension["users"] = parseInt(ext[23].replace(/[ ,\+]/g, ""));
        extensionsList.push(extension);
        console.log(extension["id"]);
      })
      callback();
    } else {
      callback("error");
      console.error(error);
    }
  })
}, function() {
  console.log("Got " + extensionsList.length.toString() + " extensions");
  fs.writeFileSync('extensions/list.json', JSON.stringify(extensionsList), {flag: 'w'})
});
