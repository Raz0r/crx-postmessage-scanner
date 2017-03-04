// https://github.com/vladignatyev/crx-extractor

var FileReader = require('filereader');
var DataView = require('buffer-dataview');

var CRXFileParser = function(file) {
  var self = this;
  self.file = file;
  this._formatUint32 = function (uint) {
    var s = uint.toString(16);
    while (s.length < 8) {
      s = '0' + s;
    }
    return '0x' + s;
  };
  this._formatCharString = function (uint) {
    var s = this._formatUint32(uint);
    s = s.substr(2, 8);
    var o = '';
    for (var i = 0; i < 4; i++) {
      o += String.fromCharCode(parseInt(s.substr(i << 1, 2), 16));
    }
    return o;
  }
  this.parse = function (dataView, arrayBuffer) {
    var magic = dataView.getUint32(0);
    if (magic == 0x43723234) { // Cr24
      //console.info('Magic is OK: ' + this._formatUint32(magic) + ' ' +
//this._formatCharString(magic));
    } else {
      console.error('Magic is broken: ' + this._formatUint32(magic) + ' ' +
this._formatCharString(magic));
      return;
    }
    var version = dataView.getUint32(4);
    //console.info('Version is: ' + this._formatUint32(version));
    var publicKeyLength = dataView.getUint32(8, true);
    //console.info('Public key length: ' + publicKeyLength);
    var signatureLength = dataView.getUint32(12, true);
    //console.info('Signature length: ' + signatureLength);
    var publicKeyBuffer = arrayBuffer.slice(16, 16 + publicKeyLength);
    var signatureBuffer = arrayBuffer.slice(16 + publicKeyLength, 16 + publicKeyLength +
signatureLength);
    var zipArchiveBuffer = arrayBuffer.slice(16 + publicKeyLength + signatureLength);
    return [zipArchiveBuffer, publicKeyBuffer, signatureBuffer];
  }
  this.load = function (handler) {
    var resultHandler = handler;
    var reader = new FileReader();
    reader.onload = function(event) {
      var buffer = event.target.result;
      var view = new DataView(buffer);
      resultHandler(self.parse(view, buffer));
    };
    reader.onerror = function(event) {
      resultHandler(undefined);
    };
    reader.readAsArrayBuffer(this.file);
  }
};

module.exports = {CRXFileParser: CRXFileParser};
