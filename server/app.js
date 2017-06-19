const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const RandomWords = require('random-words')

const app = express();

var subscribers = {};
var publishers = {};

var viewer = express.static('viewer');

app.get('/init', function init(req, res) {
    var sessionId = RandomWords(1)[0];
    res.send({'session_id': sessionId});
    subscribers[sessionId] = [];
    app.use('/' + sessionId, viewer);
});

app.get('/', function(req, res) {
    res.send('<h1>Toml\'s super-good termcast thinger!</h1>' +
             '<p>Go <a href="https://github.com/lampholder/termcast/tree/master/cli">to the github page' +
             ' to get the python script and its bash wrapper</a>, then run .termcast.sh to start sharing' +
             ' your terminal session with the internet intuitively and greatly for fun and profit!</p>');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

//repl = require("repl")
//r = repl.start("node> ")
//r.context.wss = wss
//

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

wss.on('connection', function connection(ws, req) {
    ws.uuid = guid();
    const location = url.parse(req.url, true);
    ws.on('message', function incoming(message) {
        var sessionId = location.path.substr(1);
        var session = subscribers[sessionId];
        var j = JSON.parse(message);
        if (j.type != 'stream') {
            console.log(j.type + ': ' + j.msg);
        }
        if (j.type == 'registerPublisher') {
            publishers[sessionId] = ws;
            publishers[sessionId].send(JSON.stringify({'type': 'viewcount', 'msg': session.length}));
            console.log('Publisher registered for stream "' + sessionId + '"');
        }
        if (j.type == 'stream') {
            wss.broadcast(sessionId, JSON.stringify({'type': 'stream', 'msg': j.msg}));
        }
        if (j.type == 'resize') {
            wss.broadcast(sessionId, JSON.stringify({'type': 'resize', 'width': j.width, 'height': j.height}));
        }
        if (j.type == 'registerSubscriber') {
            session.push(ws);
            if (sessionId in publishers && publishers[sessionId].readyState === WebSocket.OPEN) {
                publishers[sessionId].send(JSON.stringify({'type': 'viewcount', 'msg': session.length}));
            }
            console.log('Subscriber registered for stream "' + sessionId + '"; total now ' + session.length);
            ws.on('close', function() {
                console.log('Subscriber unregistered from stream "' + sessionId + '"; total now ' + session.length);
                subscribers[sessionId] = subscribers[sessionId].filter(function(w) { return w.uuid !== ws.uuid; }); 
                if (sessionId in publishers && publishers[sessionId].readyState === WebSocket.OPEN) {
                    publishers[sessionId].send(JSON.stringify({'type': 'viewcount', 'msg': session.length}));
                }
            });
        }
    });
});

// Broadcast to all.
wss.broadcast = function broadcast(session, data) {
    var clients = subscribers[session];
    clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

server.listen(80, function listening() {
  console.log('Listening on %d', server.address().port);
});
