// Copyright (c) 2015 Christopher Pietsch

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require('fs');
var udp = require("dgram");
var osc = require('osc-min');
var argv = require('minimist')(process.argv.slice(2));
var os = require("os");
var spawn = require('child_process').spawn;

var arduinoServer = function () {
  var self = {};
  var arduinoLicht = require('./arduino.js')("/dev/tty.usbmodemfa211");
  var arduinoBrille = require('./arduino.js')("/dev/tty.usbmodem1d11");

  self.setFreq2 = function (binaural, alt) {
    arduinoLicht.setFreq2(binaural,alt);
    arduinoBrille.setFreq2(binaural,alt);
  }

  return self;

}();
// var arduinoBrille = require('./arduino.js')("usbmodem14111");
var Resonator = require('./resonator.js');

var serverPort = 3000;
var socketPort = 5000;
var getServerAdress = function(){ return "http://" + os.hostname() + ":" + serverPort; };
var prc = null;

if(argv.live == true){
  console.log("start live session")
  prc = logProcess(spawn('muse-io', ['--device', 'chris', '--osc', 'osc.udp://localhost:'+socketPort, '--dsp']));
}
if(argv.recorded == true){
  console.log("start recorded session")
  prc = logProcess(spawn('muse-player',  ['-j', '-f', __dirname +'/recordings/peter.muse', '-s', 'osc.udp://localhost:'+socketPort]));
}

console.log("starting resonator", getServerAdress(), argv)

app.use(express.static('public'));
server.listen(serverPort);

//arduino.search();

var resonator = Resonator(arduinoServer, io);

var museSocket = udp.createSocket("udp4", function(msg, rinfo) {
  //console.log(msg);
  resonator.parseMusePacket(osc.fromBuffer(msg));
});

museSocket.bind(socketPort);

io.on('connection', function(socket){

  socket.emit("init", {
    calibration: resonator.data.fftBufferSizeStatic,
    now: resonator.data.fftBufferSize,
    z: resonator.data.zSize
  });

  console.log("socket connected");

  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
    console.log("disconnected");
    // sock.close();
  });

  // socket.on("setFreq", arduino.setFreq);

  // socket.on("stop", arduino.stop);


  socket.on("getConfig", function(fn) {
    fn(museConfig);
  });

  socket.on("eyeBlinkedTreshold", function(size){
    resonator.data.eyeBlinkedTreshold = parseInt(size*10);
    console.log("eyeBlinkedTreshold", size);
  });

  socket.on("binauralFilter", function(size){
    resonator.data.arduinoFactor = size*1;
    console.log("binauralFilter", size*1);
  });

  socket.on("setField", function(field){
    resonator.data.arduinoField = field;
    console.log("setField", field);
  });

  socket.on("calibrate", function(data){
    resonator.data.setFFTBufferSizeStatic(parseInt(data.calibration*10));
    resonator.data.setFFTBufferSize(parseInt(data.now*10));
    resonator.data.setFFTzSize(parseInt(data.z*10));
    console.log("calibrate", data);
  
  });

});


function exitHandler(options, err) {
  if(prc){
    prc.stdin.pause();
    prc.kill();
  }


    if (options.cleanup) console.log('clean');
    if (err) console.log(err.stack);
    if (options.exit) process.exit();
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

var prcReplaces = [
  '\\[K',
  '\\[A',
  '\\[0m',
  '\\[1m',
  '\\[32m',
  '\\[31m',
];

var prcRegex =  new RegExp(prcReplaces.join("|"),'ig');

function logProcess(prc){
  prc.stdout.setEncoding('utf8');
  prc.stdout.on('data', function (data) {
      var str = data.toString()
      var lines = str.split(/(\r?\n)/g);
      var clean = str.replace(prcRegex, "");
      io.emit("debug", clean);
      // console.log(lines.join(""));
  });


  prc.on('close', function (code) {
      console.log('could not start muse');
      io.emit("debug", "could not start muse");
  });

  prc.unref();

  return prc;
}


