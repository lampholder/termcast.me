(function() {
    "use strict";

    const express = require('express');
    const http = require('http');
    const url = require('url');
    const WebSocket = require('ws');
    const RandomWords = require('random-words');
    const sqlite3 = require('sqlite3').verbose();
    const app = express();

    app.set('views', './views');
    app.set('view engine', 'pug');

    /* I don't know how to program in node, so let's try and keep it simple. */

    // So far the sessionManager's being db-backed is almost entirely valueless :(
    var sessionManager = {
        db: function() {
            var connection = new sqlite3.Database('sessions.db');
            connection.serialize(function() {
                connection.run('create table if not exists sessions (sessionId text not null, width integer not null, height integer not null)');
            });
            return connection;
        }(),
        registerSession: function(width, height) {
            var self = this;
            return new Promise(function(fullfil, reject) {
                (function myself() {
                    var sessionId = RandomWords(1)[0];
                    self.db.get('select count(sessionId) as total from sessions where sessionId = ?',
                                [sessionId],
                                function(err, row) {
                                    if (row.total == 0) {
                                        var stmt = self.db.prepare('insert into sessions (sessionId, width, height) values (?, ?, ?)');
                                        stmt.run(sessionId, width, height);
                                        fullfil(sessionId);
                                    }
                                    else {
                                        console.log(sessionId + ' was no good; trying another.');
                                        myself();
                                    }
                                });
                })();
            });
        },
        destroySession: function(sessionId) {
            var self = this;
            return new Promise(function(fullfil, reject) {
                var query = self.db.query('delete from sessions where id = ?' [sessionId]);
                fullfil();
            });
        }
    };

    var connectionManager = {
        publishers: {},
        subscribers: {},
        subscribe: function(sessionId, websocket) {
            if (!(sessionId in self.subscribers)) {
                self.subscribers[sessionId] = [];
            }
            self.subscribers[sessionId].push(websocket);
        },
        unsubscribe: function(sessionId, websocket) {
            self.subscribers[sessionId] = self.subscribers[sessionId].filter(function(s) { return s.uuid !== websocket.uuid; });
        },
        registerPublisher: function(sessionId, websocket) {
            //TODO: put some stuff in here to verify we're the right publisher.
            self.publishers[sessionId] = websocket;
        }
    };

    app.get('/init', function init(request, response) {
        sessionManager.registerSession(request.query.width, request.query.height).then(
            function(sessionId) {
                console.log(sessionId);
                response.send({session_id: sessionId,
                               width: request.query.width,
                               height: request.query.height});
                //subscribers[sessionId] = [];
                //publishers_termsizes[sessionId] = {'width': 0, 'height': 0};
                app.use('/' + sessionId, function(req, res) {
                    var dimensions = publishers_termsizes[sessionId];
                    res.render('index', {'height': dimensions.height, 'width': dimensions.width}); 
                });
            }
        );
    });


    app.use('/static', express.static('static'));

    app.get('/', function(req, res) {
        res.send('<h1>Toml\'s super-good termcast thinger!</h1>' +
                 '<p>Go <a href="https://github.com/lampholder/termcast/tree/master/cli">to the github page' +
                 ' to get the python script and its bash wrapper</a>, then run .termcast.sh to start sharing' +
                 ' your terminal session with the internet intuitively and greatly for fun and profit!</p>');
    });

    const httpServer = http.createServer(app);
    const websocketServer = new WebSocket.Server({ httpServer });

    // Broadcast to everyone in a session.
    websocketServer.broadcast = function broadcast(sessionId, message) {
        var clients = connectionManager.subscribers[sessionId];
        clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    websocketServer.on('connection', function connection(websocket, request) {
        function guid() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000)
                       .toString(16)
                       .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                   s4() + '-' + s4() + s4() + s4();
        }

        websocket.uuid = guid();
        var location = url.parse(req.url, true);

        websocket.on('message', function incoming(msg) {
            var message = JSON.parse(msg);
            var sessionId = location.path.substr(1);
            var session = subscribers[sessionId];

            if (message.type != 'stream') {
                console.log(message.type + ': ' + message.body);
            }

            switch(message.type) {
                case 'registerPublisher':
                    connectionManager.registerPublisher(sessionId, websocket);
                    publishers[sessionId].send(JSON.stringify({'type': 'viewcount', 'msg': session.length}));
                    console.log('Publisher registered for stream "' + sessionId + '"');
                    break;
                case 'stream':
                    websocketServer.broadcast(sessionId, JSON.stringify(message));
                    break;
                case 'registerSubscriber':
                    connectionManager.subscribe(sessionId, websocket);

                    // Notify the publisher that they've got a new subscriber (this doesn't belong here)
                    if (sessionId in connectionManager.publishers &&
                        connectionManager.publishers[sessionId].readyState === WebSocket.OPEN) {
                        connectionManager.publisers[sessionId].send(
                                JSON.stringify({type: 'viewcount',
                                                body: connectionManager.subscribers[sessionId].length}));
                    }

                    websocket.on('close', function() {
                        console.log('Subscriber unregistered from stream "' + sessionId);
                        connectionManager.unsubscribe(sessionId, websocket);

                        // Notify the publisher that they've lost a subscriber (this doesn't belong here)
                        if (sessionId in connectionManager.publishers &&
                            connectionManager.publishers[sessionId].readyState === WebSocket.OPEN) {
                            connectionManager.publisers[sessionId].send(
                                    JSON.stringify({type: 'viewcount',
                                                    body: connectionManager.subscribers[sessionId].length}));
                        }
                    });
                    break;
            }
        });
    });


    httpServer.listen(80, function listening() {
      console.log('Listening on %d', httpServer.address().port);
    });

}());
