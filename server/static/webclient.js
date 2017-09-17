function WebClient(terminalManager, notifier) {
    var self = this;

    var terminal = terminalManager.terminal;

    this.host = function() {
        return (location.protocol == 'https:' ? 'wss' : 'ws') +
                   '://' +
                   location.hostname +
                   (location.port ? ':' + location.port : '') +
                   '/' +
                   location.pathname.substr(1);
    };

    /* Handlers */
    var handleStream = function(packet) {
        terminal.write(packet.body);
    };

    var handleSync = function(packet) {
        terminal.resize(packet.width, packet.height);
        terminal.write(packet.body);
    };

    var handleStreamClosed = function(packet) {
        notifier.show('Broadcaster has disconnected.');
    };

    var connectionEstablished = function() {
        notifier.hide();
    };

    /* Mechanics */
    var webSocket = null;

    var initiateWebSocket = function() {
        webSocket = new WebSocket(self.host());

        webSocket.onopen = function(event) {
            self.messages.registerSubscriber();
            connectionEstablished();
        };

        webSocket.onmessage = function(event) {
            /* All the message routing goodness goes here */
            var packet = JSON.parse(event.data);

            switch(packet.type) {
                case 'reset':
                    location.reload();
                    break;
                case 'id':
                    console.log('Assigned id: ' + packet.body);
                    break;
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

        webSocket.onclose = function() {
            notifier.show('Server cannot be reached, retrying...');
        };
    };

    var send = function(jsonMessage) {
        webSocket.send(JSON.stringify(jsonMessage));
    };

    this.messages = {
        registerSubscriber: function() {
            send({'type': 'registerSubscriber'});
        },
    };

    this.close = function() {
        webSocket.close();
    };

    var monitorConnection = function() {
        if (webSocket == undefined ||
            webSocket.readyState === WebSocket.CLOSED) {
            initiateWebSocket();
        }
        setTimeout(monitorConnection, 1000);
    };
    monitorConnection();

}

function TerminalManager(domElement) {
    var self = this;

    this.terminal = new Terminal({scrollback: 100});
    this.terminal.open(domElement);

    /* All of this stuff is only good for one fullscreen terminal for now. */
    var waitUntilTerminalRenderedThen = function(func) {
        if ($('.xterm-viewport').length) {
            setTimeout(func, 500);
        }
        else {
            setTimeout(waitOnTerminalRendered, 10);
        }
    };

    var setUpTerminal = function() {
        $('.xterm-viewport').remove();
        $('.xterm-rows').css('transform-origin', 'left top');
        self.scaleTerminal();
        $('#terminal').css('opacity', '1');
        $(window).resize(self.scaleTerminal);
    };

    this.scaleTerminal = function() {
        var xfactor = $(window).innerWidth() / $('.xterm-rows')[0].offsetWidth;
        var yfactor = $(window).innerHeight() / $('.xterm-rows')[0].offsetHeight;
        $('.xterm-rows').css('transform', 'scale(' + xfactor + ', ' + yfactor + ')');
    };

    waitUntilTerminalRenderedThen(setUpTerminal);
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

    var terminalManager = new TerminalManager($('#terminal').get(0));
    var notifier = new Notifier($('#term-messages').get(0));

    var webclient = new WebClient(terminalManager, notifier);

});
