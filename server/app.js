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

        function Session(id, token) {
            this.id = function() { return id; };
            this.token = function() { return token; };

            var self = this;

            var publisher = null;
            this.publisher = function(pub, token) {
                if (pub === undefined) {
                    if (publisher == null) {
                        console.log('Error: publisher requested but none set for ' + self.id());
                    }
                    return publisher;
                }
                else if (token === this.token()) {
                    console.log('Setting publisher for ' + self.id() + ' to ' + pub.uuid);
                    publisher = pub;
                    sendSubscriberCount();
                }
                else {
                    console.log('Invalid publisher token provided, rejecting');
                }
            };

            var sendSubscriberCount = function() {
                console.log('Sending subscriber count ' + self.id() + ': ' + subscribers.length);
                if (self.publisher() != null &&
                    self.publisher().readyState === WebSocket.OPEN) {
                    self.publisher().send(JSON.stringify({type: 'viewcount',
                                                          body: subscribers.length}));
                }
            };

            var requestSync = function(subscriber) {
                console.log('Requesting sync for ' + self.id() + ' for ' + subscriber.uuid);
                self.publisher().send(JSON.stringify({type: 'requestSync',
                                                      requester: subscriber.uuid}));
            };

            var subscribers = [];
            var subscribers_map = {};
            this.subscribe = function(subscriber) {
                if (subscribers.indexOf(subscriber) === -1) {
                    subscribers.push(subscriber);
                    subscribers_map[subscriber.uuid] = subscriber;
                    console.log('Subscribing: ' + subscriber.uuid +
                                ' (new total: ' + subscribers.length + ')');
                    requestSync(subscriber);
                    sendSubscriberCount();
                }
            };
            this.unsubscribe = function(subscriber) {
                if (subscribers.indexOf(subscriber) !== -1) {
                    subscribers = subscribers.filter(function(s) { return s.uuid !== subscriber.uuid; });
                    delete subscribers_map[subscriber.uuid];
                    console.log('Unsubscribing: ' + subscriber.uuid +
                                ' (new total: ' + subscribers.length + ')');
                    sendSubscriberCount();
                }
            };

            this.broadcast = function broadcast(data) {
                var string_data = JSON.stringify(data);
                subscribers.forEach(function each(subscriber) {
                    if (subscriber.readyState === WebSocket.OPEN) {
                        subscriber.send(string_data);
                    }
                    else if (subscriber.readyState === WebSocket.CLOSED) {
                        console.log('Stale subscriber found (' + subscriber.uuid + '); removing');
                        self.unsubscribe(subscriber);
                    }
                    else {
                        console.log('Message not sent to ' + subscriber.uuid +
                                    ' - ' + subscriber.readyState);
                    }
                });
            };

            this.narrowcast = function broadcast(data) {
                var string_data = JSON.stringify(data);
                var subscriber = subscribers_map[data.target];

                if (subscriber !== undefined &&
                    subscriber.readyState === WebSocket.OPEN) {
                    subscriber.send(string_data);
                }
                else {
                    console.log(subscriber.uuid + ' - ' + subscriber.readyState);
                }
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
                    db.get('select sessionId, token from sessions where sessionId = ?',
                           [sessionId],
                           function(err, row) {
                               if (row === undefined) {
                                   reject();
                               }
                               else {
                                   var session = new Session(row.sessionId, row.token);
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
                connection.run('create table if not exists sessions (sessionId text not null, token text not null)');
            });
            return connection;
        }();

        this.registerSession = function(token, idGenerator) {
            return new Promise(function(fullfil, reject) {
                (function myself() {
                    var sessionId = idGenerator();
                    console.log('Checking availability for \'' + sessionId + '\'');
                    db.get('select count(sessionId) as total from sessions where sessionId = ?',
                                [sessionId],
                                function(err, row) {
                                    if (row.total == 0) {
                                        var stmt = db.prepare('insert into sessions (sessionId, token) values (?, ?)');
                                        stmt.run(sessionId, token);
                                        var session = new Session(sessionId, token);
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
        var idGenerator = function() {
            return hat();
        };
        if (request.query.idGenerator == 'dictionary') {
            idGenerator = function() {
                return RandomWords(1)[0];
            };
        }
        sessionManager.registerSession(token, idGenerator).then(
            function(session) {
                response.send({id: session.id(),
                               token: session.token()
                });
            }
        );
    });


    app.use('/static', express.static('static'));

    app.get('/:sessionId', function(req, res) {
        sessionManager.getSession(req.params.sessionId).then(
            function(session) {
                res.render('index');
            }).catch(function() {
                res.send(req.params.sessionId + ' is not an active session.');
            });
    });

    app.get('/', function(req, res) {
        res.redirect('https://github.com/lampholder/termcast/');
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
        websocket.send(JSON.stringify({type: 'id', body: websocket.uuid}));

        var location = url.parse(request.url, true);

        websocket.on('message', function incoming(msg) {
            var message = JSON.parse(msg);
            sessionManager.getSession(location.path.substr(1)).then(function(session) {
                switch(message.type) {
                    case 'registerPublisher':
                        if (message.token === session.token()) {
                            session.publisher(websocket, message.token);
                            session.broadcast({type: 'reset'});
                        }
                        websocket.on('close', function() {
                            session.broadcast({type: 'closed'});
                        });
                        break;
                    case 'registerSubscriber':
                        session.subscribe(websocket);
                        websocket.on('close', function() {
                            session.unsubscribe(websocket);
                        });
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
                    case 'reset':
                        session.broadcast(message);
                        break;
                    case 'sync':
                        if (message.token === session.token()) {
                            console.log('Sending requested sync to ' + message.target);
                            session.narrowcast(message);
                        }
                        break;
                    default:
                        console.log('Unhandled message:' + msg);
                        break;
                }
            });
        });
    });


    server.listen(8080, function listening() {
        console.log('Listening on %d', server.address().port);
    });

}());
