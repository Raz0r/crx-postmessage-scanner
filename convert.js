var FileAPI = require('file-api'), File = FileAPI.File
var CRXFileParser = require('./CRXFileParser').CRXFileParser;
var saveAs = require('file-saver');
var fs = require('fs');
var unzip = require('unzip');
var stream = require('stream');
var acorn = require('acorn');
var beautify = require('js-beautify').js_beautify;
var rimraf = require('rimraf');
var path = require('path');
var mkdirp = require('mkdirp').sync;
var util = require('util');
var elasticsearch = require('elasticsearch');
var xattr = require('fs-xattr');
var async = require('async');
var client = new elasticsearch.Client({
  host: 'elastic:changeme@localhost:9200',
  log: 'trace',
  auth: 'elastic:changeme'
});

var extensions = {};

function getLine(filename, line_no, callback) {
    var stream = fs.createReadStream(filename);
    var fileData = '';
    stream.on('data', function(data){
      fileData += data;
      var lines = fileData.split("\n");
      if(lines.length >= +line_no){
        stream.destroy();
        callback(null, lines[+line_no]);
      }
    });
    stream.on('error', function(){
      callback('Error', null);
    });
    stream.on('end', function(){
      callback('File end reached without finding line', null);
    });

}

acorn.plugins.postMessageScanner = function(parser) {
  parser.extend('finishNode', function(nextMethod) {
      return function(node, type) {
            if(node.arguments) {
              var that = this;
              var ret = node.arguments.some(function(arg, i) {
                if(arg.value && arg.value === 'message') {
                  var js = fs.readFileSync(node.loc.source);
                  var lines = js.toString().split("\n");
                  var line = lines[node.loc.start.line-1];
                  var parts = node.loc.source.split('/');
                  parts.shift(); // tmp
                  var id = parts.shift();
                  var filename = parts.join('/');
                  extensions[id]["postMessages"].push({
                    lineNo: node.loc.start.line,
                    line: line,
                    filename: filename
                  })
                }
              })
              return nextMethod.call(this, node, type);
          } else {
            return nextMethod.call(this, node, type);
          }
      };
  });
};

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var files = fs.readdirSync('./extensions/');

function clone(obj) {
    if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}

async.eachOfLimit(files, 50, function(f, key, callback){
  var id = f.replace(/\.[^/.]+$/, "")

  console.log(key);
  if(f.endsWith('.json')) {
    callback()
    return
  }

  if(!fs.existsSync('./extensions/' + id + '.json')) {
    callback()
    return;
  }

  client.search({
    index: 'extensions',
    type: 'extension',
    body: {
        "query" : {
            "constant_score" : {
                "filter" : {
                    "term" : {
                        "id" : id
                    }
                }
            }
        }
    }
  }, function (error, response) {
    if(response.hits.total === 0) {
      console.log("[~] does not exist! " + id);

      var metadata = JSON.parse(fs.readFileSync('./extensions/' + id + '.json'));
      extensions[id] = {
        id: id,
        postMessages: [],
        name: metadata.name,
        users: metadata.users
      };
      console.log(f);
      var file = new File('./extensions/' + f);
      try {
          var parser = new CRXFileParser(file);
      } catch (ex) {
        callback();
        return;
      }

      parser.load(function(parsingResult){
        if(!parsingResult) {
          console.log("Cannot parse " + f);
          callback()
          return ;
        }
        var bufferStream = new stream.PassThrough();
        var zipArchiveBuffer = parsingResult[0];
        bufferStream.end(zipArchiveBuffer);
        var dir = 'tmp/' + path.basename(f).replace(/\.[^/.]+$/, "") + '/'
        rimraf(dir, function(){
          fs.mkdirSync(dir);
          bufferStream.pipe(unzip.Parse())
            .on('entry', function (entry) {
              var fileName = entry.path;
              var type = entry.type; // 'Directory' or 'File'
              mkdirp(dir + path.dirname(fileName));
              if(type === 'File') {
                entry.pipe(fs.createWriteStream(dir + fileName, {flags: 'w'})).on('close', function() {
                  if(fileName.endsWith('.js')) {
                    var str = beautify(fs.readFileSync(dir + fileName).toString());
                    fs.writeFileSync(dir + fileName, str, {flag: 'w'});
                  }
                });
              }
            })
            .on('error', function(err) {
              console.error(err);
            })
            .on('close', function(){
              try {
                var manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json'));
              } catch (ex) {
                callback()
                return
              }

              extensions[id]["manifest"] = clone(manifest);
              if(extensions[id]["manifest"]["browser_action"] && extensions[id]["manifest"]["browser_action"]["default_icon"]) {
                delete extensions[id]["manifest"]["browser_action"]["default_icon"]
              }
              if(extensions[id]["manifest"]["page_action"] && extensions[id]["manifest"]["page_action"]["default_icon"]) {
                delete extensions[id]["manifest"]["page_action"]["default_icon"]
              }
              if(extensions[id]["manifest"]["icons"]) {
                delete extensions[id]["manifest"]["icons"]
              }

              extensions[id]["manifest"]["content_scripts"] = [];
              extensions[id]["manifest"]["content_scripts_pages"] = [];

              if(manifest.content_scripts) {
                manifest.content_scripts.forEach(function(c, i){

                  extensions[id]["manifest"]["content_scripts_pages"] = extensions[id]["manifest"]["content_scripts_pages"].concat(c.matches);
                  c.js && c.js.forEach(function(j){
                    extensions[id]["manifest"]["content_scripts"].push(j);
                    if(fs.existsSync(dir + j)) {
                      var js = fs.readFileSync(dir + j);
                      try {
                        acorn.parse(js, {
                          ecmaVersion: 6,
                          allowImportExportEverywhere: true,
                          allowReserved: true,
                          locations: true,
                          sourceFile: dir + j,
                          plugins: {postMessageScanner: true}
                        });
                      } catch(ex) {}
                    }
                  })

                  if(i === manifest.content_scripts.length-1) {
                    extensions[id]["manifest"]["has_content_scripts"] = extensions[id]["manifest"]["content_scripts"].length>0;
                    extensions[id]["postMessagesCount"] = extensions[id]["postMessages"].length;
                    client.index({
                      index: 'extensions',
                      type: 'extension',
                      body: extensions[id]
                    }, function (error, response) {
                      console.log("[~] indexed: " + id);
                      delete extensions[id]
                      callback();
                    });
                  }
                })
              } else {
                extensions[id]["manifest"]["has_content_scripts"] = false;
                extensions[id]["postMessagesCount"] = 0;
                client.index({
                  index: 'extensions',
                  type: 'extension',
                  body: extensions[id]
                }, function (error, response) {
                  console.log("[~] indexed: " + id);
                  delete extensions[id]
                  callback();
                });
              }

            })
        });
      });
    } else {
      callback();
    }
  });
})
