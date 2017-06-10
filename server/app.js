const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const RandomWords = require('random-words')

var d = require('domain').create()
d.on('error', function(err){
    // handle the error safely
    console.log(err)
})

d.run(function () {
        const app = express();

        var viewer = express.static('viewer');

        app.use('/init', function init(req, res) {
            var id = RandomWords(1)[0];
            var id = 'fixed';
            app.use('/' + id, viewer);
            res.send({'session': id});
        });

        const server = http.createServer(app);
        const wss = new WebSocket.Server({ server });

        //repl = require("repl")
        //r = repl.start("node> ")
        //r.context.wss = wss
        //
        var sessions = {};

        wss.on('connection', function connection(ws, req) {
          const location = url.parse(req.url, true);
          if (!(location.path in sessions)) {
              sessions[location.path] = [];
          }
          sessions[location.path].push(ws);
          var viewingMessage = JSON.stringify({'type': 'viewcount', 'msg': sessions[location.path].length});
          console.log('attach' + viewingMessage);
          wss.broadcast(location.path, JSON.stringify({'type': 'viewcount', 'msg': sessions[location.path].length}));
          console.log('location: ' + location.path);
          ws.on('message', function incoming(message) {
            wss.broadcast(location.path, message);
          });
          ws.on('close', function() {
              sessions[location.path] = sessions[location.path].filter(function(connection) { return connection !== ws });
              var viewingMessage = JSON.stringify({'type': 'viewcount', 'msg': sessions[location.path].length});
              console.log('detatch' + viewingMessage);
              wss.broadcast(location.path, viewingMessage);
          });

        });

        // Broadcast to all.
        wss.broadcast = function broadcast(session, data) {
          var clients = sessions[session];
          clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          });
        };

        server.listen(80, function listening() {
          console.log('Listening on %d', server.address().port);
        });
});
