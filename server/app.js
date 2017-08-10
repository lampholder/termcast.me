(function() {
    "use strict";

    const express = require('express');
    const http = require('http');
    const url = require('url');
    const WebSocket = require('ws');
    const RandomWords = require('random-words');
    const sqlite3 = require('sqlite3').verbose();
    const hat = require('hat');
    const app = express();

    app.set('views', './views');
    app.set('view engine', 'pug');

    /* I don't know how to program in node, so let's try and keep it simple. */

    function SessionManager() {

        function Session(id, token, width, height) {
            this.id = function() { return id; };
            this.token = function() { return token; };
            this.width = function() { return width; };
            this.height = function() { return height; };

            var publisher = null;
            this.publisher = function(pub, token) {
                if (pub === undefined) {
                    return publisher;
                }
                else if (token === this.token()) {
                    publisher = pub;
                    sendSubscriberCount();
                }
            };

            var self = this;
            var sendSubscriberCount = function() {
                console.log('Sending subscriber count ' + self.publisher());
                if (self.publisher() != null &&
                    self.publisher().readyState === WebSocket.OPEN) {
                    self.publisher().send(JSON.stringify({type: 'viewcount',
                                                          body: subscribers.length}));
                }
            };

            var subscribers = [];
            this.subscribe = function(subscriber) {
                if (subscribers.indexOf(subscriber) === -1) {
                    subscribers.push(subscriber);
                    console.log('Adding ' + subscriber.uuid + ' Total: ' + subscribers.length);
                    sendSubscriberCount();
                }
            };
            this.unsubscribe = function(subscriber) {
                if (subscribers.indexOf(subscriber) !== -1) {
                    subscribers = subscribers.filter(function(s) { return s.uuid !== subscriber.uuid; });
                    console.log('Removing ' + subscriber.uuid + ' Total: ' + subscribers.length);
                    sendSubscriberCount();
                }
            };

            this.broadcast = function broadcast(data) {
                var string_data = JSON.stringify(data);
                subscribers.forEach(function each(subscriber) {
                    if (subscriber.readyState === WebSocket.OPEN) {
                        subscriber.send(string_data);
                    }
                    else {
                        console.log(subscriber.uuid + ' - ' + subscriber.readyState);
                    }
                });
            };

        }

        var sessions = {};
        this.getSessions = function() {
            return sessions;
        };

        this.getSession = function(sessionId) {
            return new Promise(function(fullfil, reject) {
                if (sessionId in sessions) {
                    fullfil(sessions[sessionId]);
                }
                else {
                    db.get('select sessionId, token, width, height from sessions where sessionId = ?',
                           [sessionId],
                           function(err, row) {
                               if (row === undefined) {
                                   reject();
                               }
                               else {
                                   var session = new Session(row.sessionId, row.token, row.width, row.height);
                                   sessions[sessionId] = session;
                                   fullfil(session);
                               }
                           });
                }
            });
        };

        var db = function() {
            /* Establishes a connection to the database; installs the schema if necessary */
            var connection = new sqlite3.Database('sessions.db');
            connection.serialize(function() {
                connection.run('create table if not exists sessions (sessionId text not null, token text not null, width integer not null, height integer not null)');
            });
            return connection;
        }();

        this.registerSession = function(width, height, token, idGenerator) {
            return new Promise(function(fullfil, reject) {
                (function myself() {
                    var sessionId = idGenerator();
                    console.log('Checking availability for \'' + sessionId + '\'');
                    db.get('select count(sessionId) as total from sessions where sessionId = ?',
                                [sessionId],
                                function(err, row) {
                                    if (row.total == 0) {
                                        var stmt = db.prepare('insert into sessions (sessionId, token, width, height) values (?, ?, ?, ?)');
                                        stmt.run(sessionId, token, width, height);
                                        var session = new Session(sessionId, token, width, height);
                                        sessions[session.id()] = session;
                                        console.log('session created');
                                        fullfil(session);
                                    }
                                    else {
                                        console.log(sessionId + ' was no good; trying another.');
                                        myself();
                                    }
                                });
                })();
            });
        };
    }

    var sessionManager = new SessionManager();

    app.get('/init', function init(request, response) {
        var token = (request.query.token != undefined ? request.query.token : hat());
        var width = (request.query.width != undefined ? request.query.width : 80);
        var height = (request.query.height != undefined ? request.query.height : 26);
        var idGenerator = function() {
            return hat();
        };
        if (request.query.idGenerator == 'dictionary') {
            idGenerator = function() {
                return RandomWords(1)[0];
            };
        }
        sessionManager.registerSession(width, height, token, idGenerator).then(
            function(session) {
                response.send({id: session.id(),
                               token: session.token(),
                               width: session.width(),
                               height: session.height()
                });
            }
        );
    });


    app.use('/static', express.static('static'));

    app.get('/:sessionId', function(req, res) {
        sessionManager.getSession(req.params.sessionId).then(
            function(session) {
                res.render('index', {'height': session.height(), 'width': session.width()}); 
            }).catch(function() {
                res.send(req.params.sessionId + ' is not an active session.');
            });
    });

    app.get('/', function(req, res) {
        res.send('<h1>Toml\'s super-good termcast thinger!</h1>' +
                 '<p>Go <a href="https://github.com/lampholder/termcast/tree/master/cli">to the github page' +
                 ' to get the python script and its bash wrapper</a>, then run .termcast.sh to start sharing' +
                 ' your terminal session with the internet intuitively and greatly for fun and profit!</p>');
    });

    const server = http.createServer(app);
    const websocketServer = new WebSocket.Server({ server });

    websocketServer.on('connection', function connection(websocket, request) {
        function guid() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                   s4() + '-' + s4() + s4() + s4();
        }

        websocket.uuid = guid();
        var location = url.parse(request.url, true);

        websocket.on('message', function incoming(msg) {
            var message = JSON.parse(msg);
            sessionManager.getSession(location.path.substr(1)).then(function(session) {

                if (message.type != 'stream') {
                    console.log(message.type + ': ' + message.body);
                }

                switch(message.type) {
                    case 'registerPublisher':
                        if (message.token === session.token()) {
                            session.publisher(websocket, message.token);
                        }
                        break;
                    case 'keepAlive':
                        if (message.token === session.token()) {
                            session.broadcast(message);
                        }
                        break;
                    case 'stream':
                        if (message.token === session.token()) {
                            session.broadcast(message);
                        }
                        break;
                    case 'registerSubscriber':
                        session.subscribe(websocket);
                        websocket.on('close', function() {
                            session.unsubscribe(websocket);
                        });
                        break;
                }
            });
        });
    });


    server.listen(80, function listening() {
        console.log('Listening on %d', server.address().port);
    });

}());
