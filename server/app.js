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

    function SessionManager() {

        function Session(id, token, width, height) {
            console.log('creating new session obj');
            this.id = function() { return id; };
            this.token = function() { return token; };
            this.width = function() { return width; };
            this.height = function() { return height; };

            var sendSubscriberCount = function() {
                if (this.publisher() != null &&
                    this.publisher().readyState === WebSocket.OPEN) {
                    this.publisher().send(JSON.stringify({type: 'viewcount',
                                                          body: this.subscribers().length}));
                }
            };

            var publisher = null;
            this.publisher = function(pub, token) {
                if (pub === null) {
                    return publisher;
                }
                else if (token === this.token()) {
                     publisher = pub;
                     sendSubscriberCount();
                }
            };

            var subscribers = [];
            this.subscribe = function(subscriber) {
                if (!(subscriber in subscribers)) {
                    subcribers.push(subscriber);
                    sendSubscriberCount();
                }
            };
            this.unsubscribe = function(subscriber) {
                if (subscriber in subscribers) {
                    subscribers = subscribers.filter(function(s) { return s.uuid !== websocket.uuid; });
                    sendSubscriberCount();
                }
            };

            this.broadcast = function broadcast(data) {
                var string_data = JSON.stringify(data);
                subscribers.forEach(function each(subscriber) {
                    if (subscriber.readyState === WebSocket.OPEN) {
                        subscriber.send(string_data);
                    }
                });
            };

        }

        var sessions = {};
        this.getSessions = function() {
            return sessions;
        };

        this.getSession = function(sessionId) {
            if (sessionId in sessions) {
                return sessions[sessionId];
            }
            else {
                return null;
            }
        };

        var db = function() {
            /* Establishes a connection to the database; installs the schema if necessary */
            var connection = new sqlite3.Database('sessions.db');
            connection.serialize(function() {
                connection.run('create table if not exists sessions (sessionId text not null, token text not null, width integer not null, height integer not null)');
            });
            return connection;
        }();

        this.registerSession = function(width, height) {
            return new Promise(function(fullfil, reject) {
                (function myself() {
                    var sessionId = RandomWords(1)[0];
                    console.log('Checking availability for \'' + sessionId + '\'');
                    db.get('select count(sessionId) as total from sessions where sessionId = ?',
                                [sessionId],
                                function(err, row) {
                                    if (row.total == 0) {
                                        var stmt = db.prepare('insert into sessions (sessionId, width, height) values (?, ?, ?)');
                                        stmt.run(sessionId, width, height);
                                        var session = new Session(sessionId, 'abc123', width, height);
                                        sessions[session.id] = session;
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

    var connectionManager = {
        publishers: {},
        subscribers: {},
        subscribe: function(sessionId, websocket) {
            if (!(sessionId in this.subscribers)) {
                this.subscribers[sessionId] = [];
            }
            this.subscribers[sessionId].push(websocket);
        },
        unsubscribe: function(sessionId, websocket) {
            this.subscribers[sessionId] = this.subscribers[sessionId].filter(function(s) { return s.uuid !== websocket.uuid; });
        },
        registerPublisher: function(sessionId, websocket) {
            //TODO: put some stuff in here to verify we're the right publisher.
            this.publishers[sessionId] = websocket;
        }
    };

    app.get('/init', function init(request, response) {
        //TODO: need to have an optional token in here
        sessionManager.registerSession(request.query.width, request.query.height).then(
            function(session) {
                response.send({id: session.id(),
                               token: session.token(),
                               width: session.width(),
                               height: session.height()
                });
                app.use('/' + session.id(), function(req, res) {
                    var dimensions = publishers_termsizes[session.id()];
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
            var session = sessionManager.getSession(location.path.substr(1));

            if (message.type != 'stream') {
                console.log(message.type + ': ' + message.body);
            }

            switch(message.type) {
                case 'registerPublisher':
                    session.publisher(websocket, 'abc123');
                    session.publisher().send(JSON.stringify({'type': 'viewcount', 'msg': session.length}));
                    console.log('Publisher registered for stream "' + session.id + '"');
                    break;
                case 'keepAlive':
                    websocketServer.broadcast(sessionId, JSON.stringify(message));
                    break;
                case 'stream':
                    session.broadcast(message);
                    break;
                case 'registerSubscriber':
                    session.subscribe(websocket);
                    websocket.on('close', function() {
                        console.log('Subscriber unregistered from stream "' + session.id);
                        session.unsubscribe(websocket);
                    });
                    break;
            }
        });
    });


    server.listen(80, function listening() {
        console.log('Listening on %d', server.address().port);
    });

}());
