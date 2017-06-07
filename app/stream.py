"""Script to establish websocket connection to the stream router."""
import time
import io
from websocket import create_connection

# TODO: Sort all of the mingity sleeping rubbish; there must be a better way

# FIXME: This should be in config somewhere
HOST = 'wss://' + 'termcast.me'
TYPESCRIPT_FILENAME = '/tmp/filename'

WS = create_connection(HOST)

with io.open(TYPESCRIPT_FILENAME, 'rb') as TYPESCRIPT_FILENAME:
    THROTTLE = 0
    while True:
        DATA = TYPESCRIPT_FILENAME.read()
        if len(DATA) > 0:
            while True:
                try:
                    WS.send(DATA)
                    break
                except Exception:
                    # FIXME: Make this a network connection exception, obvs
                    # This is a super-clumsy effort to spin on a broken connection.
                    print 'Connection broken; waiting to reestablish'
                    time.sleep(10)
            THROTTLE = 0
        else:
            THROTTLE += 1
        if THROTTLE > 100:
            time.sleep(0.1)
