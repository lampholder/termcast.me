function WebClient(terminal, notifier) {
    var self = this;

    this.host = function() {
        return 'wss://termcast.me/' + window.location.pathname.substr(1);
    };

    var webSocket = null;
    monitorConnection();

    var initiateWebSocket = function() {
        self.webSocket = new WebSocket(self.host());

        self.webSocket.onopen = function(event) {
            self.messages.registerSubscriber();
        };

        self.webSocket.onmessage = function(event) {
            /* All the message routing goodness goes here */
            var packet = JSON.parse(event.data);

            switch(packet.type) {
                case 'stream':
                    handleStream(packet);
                    break;
                case 'sync':
                    handleSync(packet);
                    break;
                case 'closed':
                    handleStreamClosed(packet);
                    break;
                default:
                    console.log('Unhandled message:' + event.data);
            }
        };
    };

    var send = function(jsonMessage) {
        self.webSocket.send(JSON.stringify(jsonMessage));
    };

    this.messages = {
        registerSubscriber: function() {
            self.send({'type': 'registerSubscriber'});
        },
    };

    this.close = function() {
        webSocket.close();
    };

    var monitorConnection = function() {
        if (self.webSocket.readyState === ws.CLOSED) {
            self.webSocket = initiateWebSocket();
        }
        setTimeout(monitorConnection, 10000);
    };

    /* Handlers */
    handleStream = function(packet) {
        terminal.write(packet.body);
    };

    handleSync = function(packet) {
        terminal.clear();
        terminal.write(packet.body);
    };

    handleStreamClosed = function(packet) {
        /* Do stuff here */
    };

}

function TerminalManager(domElement) {
    var self = this;

    this.terminal = new Terminal({scrollback: 0});
    this.terminal.open(domElement);

    waitUntilTerminalRenderedThen(setUpTerminal);

    /* All of this stuff is only good for one fullscreen terminal for now. */
    var waitUntilTerminalRenderedThen = function(func) {
        if ($('.xterm-viewport').length) {
            func();
        }
        else {
            setTimeout(waitOnTerminalRendered, 10);
        }
    };

    var setUpTerminal = function() {
        $('.xterm-viewport').remove();
        $('.xterm-rows').css('transform-origin', 'left top');
        scaleTerminal();
        $('#terminal').css('opacity', '1');
        $(window).resize(scaleTerminal);
    };

    var scaleTerminal = function() {
        var xfactor = $(window).innerWidth() / $('.xterm-rows')[0].offsetWidth;
        var yfactor = $(window).innerHeight() / $('.xterm-rows')[0].offsetHeight;
        $('.xterm-rows').css('transform', 'scale(' + xfactor + ', ' + yfactor + ')');
    };

}

function Notifier(domElement) {
    var self = this;

    var systemMessages = $(domElement);

    this.show = function(message) {
        systemMessages.find('#message').text(message);
        systemMessages.show();
    };

    this.hide = function() {
        systemMessages.find('#message').text('');
        systemMessages.hide();
    };
}

$(document).ready(function(event) {

    var terminal = TerminalManager($('#terminal'));
    var notifier = Notifier($('#term-messages'));

    var websocket = WebSocket(terminal, notifier);

});
